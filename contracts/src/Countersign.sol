// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Countersign
/// @notice An N-of-N attestation engine for document fingerprints on BOT Chain.
///
/// Several wallets agree to the same document hash. Once opened, each named signer signs
/// or declines. When every signer has signed, the agreement is completed. If any signer
/// declines or the deadline lapses, the agreement can never complete.
///
/// What it deliberately cannot do:
/// - No document storage on-chain: only the SHA-256 fingerprint is recorded.
/// - No cancellation, editing, or signer replacement after creation.
/// - No signature withdrawal: once signed, a signature is permanent.
/// - No owner, admin, or pause controls.
contract Countersign {
    uint256 public constant MIN_SIGNERS = 2;
    uint256 public constant MAX_SIGNERS = 20;
    uint256 public constant MAX_TITLE_BYTES = 80;
    uint256 public constant MAX_DEADLINE = 365 days;
    uint256 public constant MAX_PAGE = 50;

    struct Agreement {
        address creator; // 20B ┐ slot 1
        uint64 deadline; // 8B  │ 0 = no deadline
        uint32 createdBlock; // 4B  ┘
        bytes32 docHash; // 32B   slot 2
        uint64 completedAt; // 8B  ┐ slot 3 (0 until completed)
        uint32 signedBitmap; // 4B  │ bit i set = signers[i] signed
        uint8 signerCount; // 1B  │
        uint8 signedCount; // 1B  │
        bool declined; // 1B  ┘
    }

    struct AgreementView {
        uint256 id;
        address creator;
        bytes32 docHash;
        uint64 deadline;
        uint32 createdBlock;
        uint64 completedAt;
        uint8 signedCount;
        uint8 signerCount;
        uint8 status; // 0 Pending, 1 Completed, 2 Declined, 3 Expired
        address declinedBy;
    }

    mapping(uint256 => Agreement) private _agreements; // ids start at 1
    mapping(uint256 => address[]) private _signers;
    mapping(uint256 => mapping(address => uint8)) private _slot; // signer index + 1; 0 = not a signer
    mapping(uint256 => address) private _declinedBy;
    mapping(address => uint256[]) private _agreementsFor; // creator and each signer, once each
    mapping(bytes32 => uint256[]) private _byDoc; // agreements referencing a document hash
    uint256 public agreementCount;

    // Events
    event Created(
        uint256 indexed id,
        address indexed creator,
        bytes32 indexed docHash,
        uint64 deadline,
        string title,
        address[] signers
    );
    event Signed(
        uint256 indexed id,
        address indexed signer,
        uint8 signedCount,
        uint8 signerCount
    );
    event Completed(uint256 indexed id, bytes32 indexed docHash, uint64 completedAt);
    event Declined(uint256 indexed id, address indexed signer);

    // Errors
    error EmptyDocument();
    error BadSignerCount(uint256 n);
    error BadSigner(uint256 index);
    error DuplicateSigner(uint256 i, uint256 j);
    error BadDeadline(uint64 deadline);
    error TitleTooLong(uint256 length, uint256 max);
    error NoSuchAgreement(uint256 id);
    error NotASigner(uint256 id, address caller);
    error NotPending(uint256 id, uint8 status);
    error PastDeadline(uint256 id, uint64 deadline);
    error AlreadySigned(uint256 id, address signer);

    /// @notice Opens a new agreement for a document hash.
    /// @param docHash The SHA-256 fingerprint of the document.
    /// @param signers The 2-20 wallet addresses required to sign.
    /// @param deadline Unix timestamp for expiration (0 for no deadline).
    /// @param title Human-readable document title (<= 80 bytes).
    function create(
        bytes32 docHash,
        address[] calldata signers,
        uint64 deadline,
        string calldata title
    ) external returns (uint256 id) {
        if (docHash == bytes32(0)) revert EmptyDocument();

        uint256 n = signers.length;
        if (n < MIN_SIGNERS || n > MAX_SIGNERS) revert BadSignerCount(n);

        if (deadline != 0) {
            if (deadline <= block.timestamp || deadline > block.timestamp + MAX_DEADLINE) {
                revert BadDeadline(deadline);
            }
        }

        uint256 titleLen = bytes(title).length;
        if (titleLen > MAX_TITLE_BYTES) revert TitleTooLong(titleLen, MAX_TITLE_BYTES);

        // Validate signers: non-zero and no duplicates (bounded at 20 signers, max 190 checks)
        for (uint256 i = 0; i < n; i++) {
            if (signers[i] == address(0)) revert BadSigner(i);
            for (uint256 j = i + 1; j < n; j++) {
                if (signers[i] == signers[j]) revert DuplicateSigner(i, j);
            }
        }

        id = ++agreementCount;

        _agreements[id] = Agreement({
            creator: msg.sender,
            deadline: deadline,
            createdBlock: uint32(block.number),
            docHash: docHash,
            completedAt: 0,
            signedBitmap: 0,
            signerCount: uint8(n),
            signedCount: 0,
            declined: false
        });

        // Store signers and set slot mappings
        _signers[id] = signers;
        for (uint256 i = 0; i < n; i++) {
            _slot[id][signers[i]] = uint8(i + 1);
        }

        // Index agreements for creator and each signer once
        _agreementsFor[msg.sender].push(id);
        for (uint256 i = 0; i < n; i++) {
            if (signers[i] != msg.sender) {
                _agreementsFor[signers[i]].push(id);
            }
        }

        // Index document hash
        _byDoc[docHash].push(id);

        emit Created(id, msg.sender, docHash, deadline, title, signers);
    }

    /// @notice Signs the agreement as a named signer.
    /// @param id The agreement id.
    function sign(uint256 id) external {
        Agreement storage a = _agreements[id];
        if (a.creator == address(0)) revert NoSuchAgreement(id);

        uint8 slotPlus1 = _slot[id][msg.sender];
        if (slotPlus1 == 0) revert NotASigner(id, msg.sender);

        uint8 signerIdx = slotPlus1 - 1;
        uint32 mask = uint32(1) << signerIdx;
        if ((a.signedBitmap & mask) != 0) revert AlreadySigned(id, msg.sender);

        uint8 status = _statusOf(a);
        if (status != 0) {
            if (a.deadline != 0 && block.timestamp > a.deadline) {
                revert PastDeadline(id, a.deadline);
            }
            revert NotPending(id, status);
        }

        // Effects
        a.signedBitmap |= mask;
        uint8 newCount = a.signedCount + 1;
        a.signedCount = newCount;

        emit Signed(id, msg.sender, newCount, a.signerCount);

        if (newCount == a.signerCount) {
            a.completedAt = uint64(block.timestamp);
            emit Completed(id, a.docHash, a.completedAt);
        }
    }

    /// @notice Declines to sign the agreement. Permanently blocks completion.
    /// @param id The agreement id.
    function decline(uint256 id) external {
        Agreement storage a = _agreements[id];
        if (a.creator == address(0)) revert NoSuchAgreement(id);

        uint8 slotPlus1 = _slot[id][msg.sender];
        if (slotPlus1 == 0) revert NotASigner(id, msg.sender);

        uint8 signerIdx = slotPlus1 - 1;
        uint32 mask = uint32(1) << signerIdx;
        if ((a.signedBitmap & mask) != 0) revert AlreadySigned(id, msg.sender);

        uint8 status = _statusOf(a);
        if (status != 0) {
            if (a.deadline != 0 && block.timestamp > a.deadline) {
                revert PastDeadline(id, a.deadline);
            }
            revert NotPending(id, status);
        }

        // Effects
        a.declined = true;
        _declinedBy[id] = msg.sender;

        emit Declined(id, msg.sender);
    }

    /// @notice Computes agreement status.
    /// @return 0 Pending, 1 Completed, 2 Declined, 3 Expired
    function _statusOf(Agreement storage a) internal view returns (uint8) {
        if (a.completedAt != 0) return 1; // Completed
        if (a.declined) return 2; // Declined
        if (a.deadline != 0 && block.timestamp > a.deadline) return 3; // Expired
        return 0; // Pending
    }

    /// @notice Returns full agreement view struct.
    function agreementOf(uint256 id) external view returns (AgreementView memory) {
        Agreement storage a = _agreements[id];
        if (a.creator == address(0)) {
            return AgreementView({
                id: 0,
                creator: address(0),
                docHash: bytes32(0),
                deadline: 0,
                createdBlock: 0,
                completedAt: 0,
                signedCount: 0,
                signerCount: 0,
                status: 0,
                declinedBy: address(0)
            });
        }

        return AgreementView({
            id: id,
            creator: a.creator,
            docHash: a.docHash,
            deadline: a.deadline,
            createdBlock: a.createdBlock,
            completedAt: a.completedAt,
            signedCount: a.signedCount,
            signerCount: a.signerCount,
            status: _statusOf(a),
            declinedBy: _declinedBy[id]
        });
    }

    /// @notice Returns the list of signers and their individual signature status.
    function signersOf(uint256 id)
        external
        view
        returns (address[] memory signers, bool[] memory signed)
    {
        Agreement storage a = _agreements[id];
        uint256 n = _signers[id].length;
        signers = _signers[id];
        signed = new bool[](n);
        uint32 bitmap = a.signedBitmap;
        for (uint256 i = 0; i < n; i++) {
            signed[i] = (bitmap & (uint32(1) << uint32(i))) != 0;
        }
    }

    /// @notice Checks if an address has signed an agreement.
    function hasSigned(uint256 id, address who) external view returns (bool) {
        uint8 slotPlus1 = _slot[id][who];
        if (slotPlus1 == 0) return false;
        uint8 idx = slotPlus1 - 1;
        return (_agreements[id].signedBitmap & (uint32(1) << idx)) != 0;
    }

    /// @notice Returns paginated agreements involving an address, newest first.
    function agreementsFor(address who, uint256 offset, uint256 count)
        external
        view
        returns (AgreementView[] memory views)
    {
        uint256 total = _agreementsFor[who].length;
        if (offset >= total || count == 0) {
            return new AgreementView[](0);
        }

        if (count > MAX_PAGE) {
            count = MAX_PAGE;
        }

        uint256 remaining = total - offset;
        uint256 limit = count < remaining ? count : remaining;
        views = new AgreementView[](limit);

        for (uint256 i = 0; i < limit; i++) {
            uint256 id = _agreementsFor[who][total - 1 - offset - i];
            Agreement storage a = _agreements[id];
            views[i] = AgreementView({
                id: id,
                creator: a.creator,
                docHash: a.docHash,
                deadline: a.deadline,
                createdBlock: a.createdBlock,
                completedAt: a.completedAt,
                signedCount: a.signedCount,
                signerCount: a.signerCount,
                status: _statusOf(a),
                declinedBy: _declinedBy[id]
            });
        }
    }

    /// @notice Returns paginated agreements referencing a document hash, newest first.
    function agreementsForDoc(bytes32 docHash, uint256 offset, uint256 count)
        external
        view
        returns (AgreementView[] memory views)
    {
        uint256 total = _byDoc[docHash].length;
        if (offset >= total || count == 0) {
            return new AgreementView[](0);
        }

        if (count > MAX_PAGE) {
            count = MAX_PAGE;
        }

        uint256 remaining = total - offset;
        uint256 limit = count < remaining ? count : remaining;
        views = new AgreementView[](limit);

        for (uint256 i = 0; i < limit; i++) {
            uint256 id = _byDoc[docHash][total - 1 - offset - i];
            Agreement storage a = _agreements[id];
            views[i] = AgreementView({
                id: id,
                creator: a.creator,
                docHash: a.docHash,
                deadline: a.deadline,
                createdBlock: a.createdBlock,
                completedAt: a.completedAt,
                signedCount: a.signedCount,
                signerCount: a.signerCount,
                status: _statusOf(a),
                declinedBy: _declinedBy[id]
            });
        }
    }
}
