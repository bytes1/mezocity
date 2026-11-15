// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMezoCoreInterfaces.sol";
import "./utils/ReentrancyGuardLite.sol";

/**
 * @title IslandCreditCouncil
 * @notice Bridges Sub-Island verified profit checkpoints with the Main Island MainMUSDVault
 *         and 5-Agent AI Credit Council underwriting verdicts on Mezo Testnet (Chain ID: 31611).
 */
contract IslandCreditCouncil is ReentrancyGuardLite {
    uint256 private constant BPS_DENOM = 10_000;
    uint256 private constant SECONDS_PER_YEAR = 365 days;

    enum LoanStatus {
        NONE,
        PENDING_COUNCIL,
        APPROVED_AWAITING_OWNER,
        REJECTED,
        DISBURSED,
        REPAID,
        DEFAULT_LIQUIDATED
    }

    enum CouncilVerdict {
        NONE,
        APPROVED,
        PARTIAL_APPROVAL,
        REJECTED,
        MORE_HISTORY_REQUIRED
    }

    struct LoanApplication {
        uint256 appId;
        uint256 islandId;
        address vault;
        address borrower;
        uint256 checkpointId;
        uint256 provedProfitUsd;
        uint256 provedRoiBps;
        uint256 requestedMusd;
        uint256 approvedMusd;
        uint256 principalRepaid;
        uint256 interestRepaid;
        uint256 accruedInterestOwed;
        uint16 aprBps;
        uint32 termDays;
        uint64 createdAt;
        uint64 disbursedAt;
        uint64 lastInterestTs;
        uint64 dueDate;
        bytes32 businessPlanHash;
        bytes32 councilTranscriptHash;
        CouncilVerdict verdict;
        LoanStatus status;
    }

    address public owner;
    address public councilOperator;
    IMainMUSDVault public immutable mainMusdVault;
    IIslandFactory public immutable islandFactory;
    IERC20Minimal public immutable musd;

    // Deterministic Underwriting Guardrails
    uint256 public minRequiredProfitUsd = 1 ether;     // >= $1.00 realized profit
    uint256 public minRequiredRoiBps = 100;            // >= 1.00% ROI
    uint256 public maxProfitLeverage = 5;              // Max loan = 5x verified profit
    uint16 public maxNavLtvBps = 8000;                 // Max loan = 80% of Island net equity
    uint16 public minAprBps = 300;                     // 3.00% APR min
    uint16 public maxAprBps = 2500;                    // 25.00% APR max
    uint256 public autoDisburseCapMusd = 500 ether;    // Hybrid auto-disburse cap

    uint256 private _nextAppId = 1;
    mapping(uint256 => LoanApplication) public applications;
    mapping(uint256 => uint256) public activeApplicationByIsland;
    mapping(uint256 => uint256[]) private _islandApplicationIds;
    mapping(uint256 => uint16) public creditScoreBps; // Starts 6500 on first interaction
    uint256[] private _allApplicationIds;

    event LoanApplicationSubmitted(
        uint256 indexed appId,
        uint256 indexed islandId,
        address indexed borrower,
        uint256 checkpointId,
        uint256 provedProfitUsd,
        uint256 requestedMusd,
        uint32 termDays
    );
    event CouncilDecisionRecorded(
        uint256 indexed appId,
        uint256 indexed islandId,
        CouncilVerdict verdict,
        uint256 approvedMusd,
        uint16 aprBps,
        LoanStatus newStatus,
        bytes32 transcriptHash
    );
    event LoanDisbursedToIsland(uint256 indexed appId, uint256 indexed islandId, address indexed vault, uint256 principalMusd, uint64 dueDate);
    event LoanRepaid(uint256 indexed appId, uint256 indexed islandId, uint256 principalPaid, uint256 interestPaid, LoanStatus newStatus);
    event LoanLiquidated(uint256 indexed appId, uint256 indexed islandId, uint256 recoveredMusd, uint256 unpaidPrincipal);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error InvalidParameters();
    error ActiveLoanExists();
    error UnverifiedProfit();
    error ExceedsDeterministicCap();
    error InvalidState();
    error DefaultConditionsNotMet();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyCouncilOrOwner() {
        if (msg.sender != councilOperator && msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(
        address _mainMusdVault,
        address _islandFactory,
        address _councilOperator
    ) {
        if (_mainMusdVault == address(0) || _islandFactory == address(0)) revert InvalidParameters();
        owner = msg.sender;
        mainMusdVault = IMainMUSDVault(_mainMusdVault);
        musd = mainMusdVault.musd();
        islandFactory = IIslandFactory(_islandFactory);
        councilOperator = _councilOperator == address(0) ? msg.sender : _councilOperator;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidParameters();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    function setCouncilOperator(address _op) external onlyOwner {
        if (_op == address(0)) revert InvalidParameters();
        councilOperator = _op;
    }

    function updateUnderwritingRules(
        uint256 _minRequiredProfitUsd,
        uint256 _minRequiredRoiBps,
        uint256 _maxProfitLeverage,
        uint16 _maxNavLtvBps,
        uint16 _minAprBps,
        uint16 _maxAprBps,
        uint256 _autoDisburseCapMusd
    ) external onlyOwner {
        if (_maxNavLtvBps == 0 || _maxNavLtvBps > 9500 || _minAprBps > _maxAprBps || _maxProfitLeverage == 0) {
            revert InvalidParameters();
        }
        minRequiredProfitUsd = _minRequiredProfitUsd;
        minRequiredRoiBps = _minRequiredRoiBps;
        maxProfitLeverage = _maxProfitLeverage;
        maxNavLtvBps = _maxNavLtvBps;
        minAprBps = _minAprBps;
        maxAprBps = _maxAprBps;
        autoDisburseCapMusd = _autoDisburseCapMusd;
    }

    function deterministicMaxLoanUsd(address vaultAddr, uint256 provedProfitUsd) public view returns (uint256) {
        uint256 byProfit = provedProfitUsd * maxProfitLeverage;
        uint256 netEquity = IIslandVault(vaultAddr).getNetEquityUsd();
        uint256 byEquity = (netEquity * maxNavLtvBps) / BPS_DENOM;
        return byProfit < byEquity ? byProfit : byEquity;
    }

    /**
     * @notice Sub-Island owner submits an on-chain profit checkpoint to request a Main Island MUSD loan.
     */
    function submitLoanApplication(
        uint256 islandId,
        uint256 checkpointId,
        uint256 requestedMusd,
        uint32 termDays,
        bytes32 businessPlanHash
    ) external nonReentrant returns (uint256 appId) {
        if (requestedMusd == 0 || termDays == 0 || termDays > 365) revert InvalidParameters();

        IIslandFactory.IslandSummary memory info = islandFactory.getIsland(islandId);
        if (info.islandId == 0 || !info.active) revert InvalidParameters();
        if (msg.sender != info.owner) revert Unauthorized();
        if (activeApplicationByIsland[islandId] != 0) revert ActiveLoanExists();

        IIslandVault vault = IIslandVault(info.vault);
        if (checkpointId >= vault.totalCheckpoints()) revert UnverifiedProfit();

        (, , , , , , , uint256 cpProfitUsd, uint256 cpRoiBps, , ) = vault.getCheckpoint(checkpointId);
        uint256 liveProfitUsd = vault.getNetProfitUsd();
        uint256 verifiedProfit = cpProfitUsd < liveProfitUsd ? cpProfitUsd : liveProfitUsd;

        if (verifiedProfit < minRequiredProfitUsd || cpRoiBps < minRequiredRoiBps) {
            revert UnverifiedProfit();
        }

        uint256 maxAllowed = deterministicMaxLoanUsd(info.vault, verifiedProfit);
        if (requestedMusd > maxAllowed) revert ExceedsDeterministicCap();

        if (creditScoreBps[islandId] == 0) {
            creditScoreBps[islandId] = 6500;
        }

        appId = _nextAppId++;
        applications[appId] = LoanApplication({
            appId: appId,
            islandId: islandId,
            vault: info.vault,
            borrower: msg.sender,
            checkpointId: checkpointId,
            provedProfitUsd: verifiedProfit,
            provedRoiBps: cpRoiBps,
            requestedMusd: requestedMusd,
            approvedMusd: 0,
            principalRepaid: 0,
            interestRepaid: 0,
            accruedInterestOwed: 0,
            aprBps: 0,
            termDays: termDays,
            createdAt: uint64(block.timestamp),
            disbursedAt: 0,
            lastInterestTs: 0,
            dueDate: 0,
            businessPlanHash: businessPlanHash,
            councilTranscriptHash: bytes32(0),
            verdict: CouncilVerdict.NONE,
            status: LoanStatus.PENDING_COUNCIL
        });

        activeApplicationByIsland[islandId] = appId;
        _islandApplicationIds[islandId].push(appId);
        _allApplicationIds.push(appId);

        emit LoanApplicationSubmitted(
            appId,
            islandId,
            msg.sender,
            checkpointId,
            verifiedProfit,
            requestedMusd,
            termDays
        );
    }

    /**
     * @notice Main Island 5-Agent Credit Council submits underwriting verdict and transcript proof.
     *         Auto-disburses immediately if approvedMusd <= autoDisburseCapMusd; otherwise awaits Owner finality.
     */
    function recordCouncilDecision(
        uint256 appId,
        uint8 verdictCode,
        uint256 approvedMusd,
        uint16 aprBps,
        bytes32 transcriptHash
    ) external nonReentrant onlyCouncilOrOwner {
        LoanApplication storage app = applications[appId];
        if (app.appId == 0 || app.status != LoanStatus.PENDING_COUNCIL) revert InvalidState();
        if (verdictCode < uint8(CouncilVerdict.APPROVED) || verdictCode > uint8(CouncilVerdict.MORE_HISTORY_REQUIRED)) {
            revert InvalidParameters();
        }

        CouncilVerdict verdict = CouncilVerdict(verdictCode);
        app.verdict = verdict;
        app.councilTranscriptHash = transcriptHash;

        if (verdict == CouncilVerdict.REJECTED || verdict == CouncilVerdict.MORE_HISTORY_REQUIRED || approvedMusd == 0) {
            app.approvedMusd = 0;
            app.status = LoanStatus.REJECTED;
            activeApplicationByIsland[app.islandId] = 0;
            emit CouncilDecisionRecorded(appId, app.islandId, verdict, 0, 0, LoanStatus.REJECTED, transcriptHash);
            return;
        }

        if (approvedMusd > app.requestedMusd) revert ExceedsDeterministicCap();
        uint256 capNow = deterministicMaxLoanUsd(app.vault, app.provedProfitUsd);
        if (approvedMusd > capNow) revert ExceedsDeterministicCap();
        if (aprBps < minAprBps || aprBps > maxAprBps) revert InvalidParameters();

        app.approvedMusd = approvedMusd;
        app.aprBps = aprBps;

        if (approvedMusd <= autoDisburseCapMusd) {
            _disburse(app, true);
        } else {
            app.status = LoanStatus.APPROVED_AWAITING_OWNER;
        }

        emit CouncilDecisionRecorded(appId, app.islandId, verdict, approvedMusd, aprBps, app.status, transcriptHash);
    }

    function finalizeAndDisburseLoan(uint256 appId) external nonReentrant onlyOwner {
        LoanApplication storage app = applications[appId];
        if (app.appId == 0 || app.status != LoanStatus.APPROVED_AWAITING_OWNER) revert InvalidState();
        _disburse(app, false);
    }

    function _disburse(LoanApplication storage app, bool isAutoDisburse) internal {
        app.status = LoanStatus.DISBURSED;
        app.disbursedAt = uint64(block.timestamp);
        app.lastInterestTs = uint64(block.timestamp);
        app.dueDate = uint64(block.timestamp + uint256(app.termDays) * 1 days);

        mainMusdVault.disburseLoan(app.vault, app.approvedMusd, app.aprBps, isAutoDisburse);
        IIslandVault(app.vault).onLoanDisbursed(app.appId, app.approvedMusd);

        emit LoanDisbursedToIsland(app.appId, app.islandId, app.vault, app.approvedMusd, app.dueDate);
    }

    function getRemainingPrincipal(uint256 appId) public view returns (uint256) {
        LoanApplication memory app = applications[appId];
        if (app.status != LoanStatus.DISBURSED) return 0;
        return app.approvedMusd > app.principalRepaid ? app.approvedMusd - app.principalRepaid : 0;
    }

    function getTotalInterestOwed(uint256 appId) public view returns (uint256) {
        LoanApplication memory app = applications[appId];
        if (app.status != LoanStatus.DISBURSED) return 0;
        uint256 remPrincipal = app.approvedMusd > app.principalRepaid ? app.approvedMusd - app.principalRepaid : 0;
        uint256 delta = 0;
        if (remPrincipal > 0 && block.timestamp > app.lastInterestTs) {
            uint256 elapsed = block.timestamp - app.lastInterestTs;
            delta = (remPrincipal * app.aprBps * elapsed) / (BPS_DENOM * SECONDS_PER_YEAR);
        }
        return app.accruedInterestOwed + delta;
    }

    /**
     * @notice Repay active loan using MUSD earned inside the Sub-Island's IslandVault.
     */
    function repayLoanFromVault(uint256 appId, uint256 maxPayMusd) external nonReentrant {
        LoanApplication storage app = applications[appId];
        if (app.appId == 0 || app.status != LoanStatus.DISBURSED) revert InvalidState();
        if (msg.sender != app.borrower && msg.sender != IIslandVault(app.vault).operator()) {
            revert Unauthorized();
        }
        _settleRepayment(app, maxPayMusd, true);
    }

    /**
     * @notice Repay active loan directly from an external MUSD wallet.
     */
    function repayLoanExternal(uint256 appId, uint256 maxPayMusd) external nonReentrant {
        LoanApplication storage app = applications[appId];
        if (app.appId == 0 || app.status != LoanStatus.DISBURSED) revert InvalidState();
        _settleRepayment(app, maxPayMusd, false);
    }

    function _settleRepayment(LoanApplication storage app, uint256 maxPayMusd, bool fromVault) internal {
        if (maxPayMusd == 0) revert InvalidParameters();

        uint256 remPrincipal = app.approvedMusd - app.principalRepaid;
        uint256 interestOwed = getTotalInterestOwed(app.appId);
        uint256 totalOwed = remPrincipal + interestOwed;
        uint256 actualPay = maxPayMusd > totalOwed ? totalOwed : maxPayMusd;

        uint256 interestPaid = actualPay > interestOwed ? interestOwed : actualPay;
        uint256 principalPaid = actualPay - interestPaid;

        app.accruedInterestOwed = interestOwed - interestPaid;
        app.lastInterestTs = uint64(block.timestamp);
        app.interestRepaid += interestPaid;
        app.principalRepaid += principalPaid;

        if (fromVault) {
            IIslandVault(app.vault).repayActiveLoanFromVault(principalPaid, actualPay, address(this));
        } else {
            bool okPull = musd.transferFrom(msg.sender, address(this), actualPay);
            if (!okPull) revert TransferFailed();
            if (principalPaid > 0) {
                IIslandVault(app.vault).notifyExternalRepayment(principalPaid);
            }
        }

        musd.approve(address(mainMusdVault), 0);
        musd.approve(address(mainMusdVault), actualPay);
        mainMusdVault.receiveLoanRepayment(principalPaid, interestPaid, app.aprBps);
        musd.approve(address(mainMusdVault), 0);

        if (app.principalRepaid >= app.approvedMusd && app.accruedInterestOwed == 0) {
            app.status = LoanStatus.REPAID;
            activeApplicationByIsland[app.islandId] = 0;
            uint16 cur = creditScoreBps[app.islandId];
            creditScoreBps[app.islandId] = cur + 250 > 9800 ? 9800 : cur + 250;
        }

        emit LoanRepaid(app.appId, app.islandId, principalPaid, interestPaid, app.status);
    }

    /**
     * @notice Permissionless default liquidation if dueDate passed OR vault falls below maintenance margin.
     */
    function liquidateDefaultedLoan(uint256 appId) external nonReentrant {
        LoanApplication storage app = applications[appId];
        if (app.appId == 0 || app.status != LoanStatus.DISBURSED) revert InvalidState();

        bool pastDue = block.timestamp > app.dueDate;
        bool undercollateralized = IIslandVault(app.vault).isLoanUndercollateralized();
        if (!pastDue && !undercollateralized) revert DefaultConditionsNotMet();

        uint256 remPrincipal = app.approvedMusd - app.principalRepaid;
        uint256 interestOwed = getTotalInterestOwed(appId);
        uint256 targetRecovery = remPrincipal + interestOwed;

        uint256 recoveredMusd = IIslandVault(app.vault).seizeDefaultedCollateral(targetRecovery, address(this));

        musd.approve(address(mainMusdVault), 0);
        if (recoveredMusd > 0) {
            musd.approve(address(mainMusdVault), recoveredMusd);
        }
        mainMusdVault.recordDefaultRecovery(remPrincipal, app.aprBps, recoveredMusd);
        musd.approve(address(mainMusdVault), 0);

        app.status = LoanStatus.DEFAULT_LIQUIDATED;
        activeApplicationByIsland[app.islandId] = 0;

        uint16 cur = creditScoreBps[app.islandId];
        creditScoreBps[app.islandId] = cur > 3500 ? cur - 1500 : 2000;

        emit LoanLiquidated(appId, app.islandId, recoveredMusd, remPrincipal);
    }

    function getIslandApplications(uint256 islandId) external view returns (LoanApplication[] memory list) {
        uint256[] memory ids = _islandApplicationIds[islandId];
        list = new LoanApplication[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = applications[ids[i]];
        }
    }

    function getAllApplications() external view returns (LoanApplication[] memory list) {
        uint256 len = _allApplicationIds.length;
        list = new LoanApplication[](len);
        for (uint256 i = 0; i < len; i++) {
            list[i] = applications[_allApplicationIds[i]];
        }
    }

    function totalApplications() external view returns (uint256) {
        return _allApplicationIds.length;
    }
}
