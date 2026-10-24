// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Countersign} from "../src/Countersign.sol";

contract CountersignTest is Test {
    Countersign public countersign;

    address public creator = address(0xAA11);
    address public alice = address(0xA1);
    address public bob = address(0xB2);
    address public charlie = address(0xC3);
    address public dave = address(0xD4);
    address public stranger = address(0xEE99);

    bytes32 public sampleHash = keccak256("Document fingerprint content");

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

    function setUp() public {
        vm.warp(1_760_000_000);
        countersign = new Countersign();
    }

    function _makeSigners3() internal view returns (address[] memory) {
        address[] memory s = new address[](3);
        s[0] = alice;
        s[1] = bob;
        s[2] = charlie;
        return s;
    }

    function test_Create_StoresAndIndexesAll() public {
        address[] memory signers = _makeSigners3();
        uint64 deadline = uint64(block.timestamp + 30 days);
        string memory title = "Operating Agreement 2026";

        vm.prank(creator);
        vm.expectEmit(true, true, true, true);
        emit Created(1, creator, sampleHash, deadline, title, signers);
        uint256 id = countersign.create(sampleHash, signers, deadline, title);
        assertEq(id, 1);
        assertEq(countersign.agreementCount(), 1);

        Countersign.AgreementView memory viewData = countersign.agreementOf(id);
        assertEq(viewData.id, 1);
        assertEq(viewData.creator, creator);
        assertEq(viewData.docHash, sampleHash);
        assertEq(viewData.deadline, deadline);
        assertEq(viewData.completedAt, 0);
        assertEq(viewData.signerCount, 3);
        assertEq(viewData.signedCount, 0);
        assertEq(viewData.status, 0); // Pending
        assertEq(viewData.declinedBy, address(0));

        (address[] memory returnedSigners, bool[] memory signedStatus) = countersign
            .signersOf(id);
        assertEq(returnedSigners.length, 3);
        assertEq(signedStatus.length, 3);
        assertEq(returnedSigners[0], alice);
        assertFalse(signedStatus[0]);

        // Indexes for creator and signers
        Countersign.AgreementView[] memory creatorAgreements = countersign.agreementsFor(
            creator,
            0,
            10
        );
        assertEq(creatorAgreements.length, 1);
        assertEq(creatorAgreements[0].id, 1);

        Countersign.AgreementView[] memory aliceAgreements = countersign.agreementsFor(
            alice,
            0,
            10
        );
        assertEq(aliceAgreements.length, 1);
        assertEq(aliceAgreements[0].id, 1);

        // Doc index
        Countersign.AgreementView[] memory docAgreements = countersign.agreementsForDoc(
            sampleHash,
            0,
            10
        );
        assertEq(docAgreements.length, 1);
        assertEq(docAgreements[0].id, 1);
    }

    function test_Create_Rejects_EmptyDoc_1Signer_21Signers_ZeroSigner_Duplicate_PastDeadline_LongTitle()
        public
    {
        address[] memory s3 = _makeSigners3();

        // 1. Empty docHash
        vm.expectRevert(Countersign.EmptyDocument.selector);
        countersign.create(bytes32(0), s3, 0, "Title");

        // 2. < 2 signers
        address[] memory s1 = new address[](1);
        s1[0] = alice;
        vm.expectRevert(abi.encodeWithSelector(Countersign.BadSignerCount.selector, 1));
        countersign.create(sampleHash, s1, 0, "Title");

        // 3. > 20 signers (21 signers)
        address[] memory s21 = new address[](21);
        for (uint160 i = 0; i < 21; i++) {
            s21[i] = address(0x1000 + i);
        }
        vm.expectRevert(abi.encodeWithSelector(Countersign.BadSignerCount.selector, 21));
        countersign.create(sampleHash, s21, 0, "Title");

        // 4. Zero signer address
        address[] memory sZero = new address[](2);
        sZero[0] = alice;
        sZero[1] = address(0);
        vm.expectRevert(abi.encodeWithSelector(Countersign.BadSigner.selector, 1));
        countersign.create(sampleHash, sZero, 0, "Title");

        // 5. Duplicate signers
        address[] memory sDup = new address[](3);
        sDup[0] = alice;
        sDup[1] = bob;
        sDup[2] = alice; // duplicate with index 0
        vm.expectRevert(abi.encodeWithSelector(Countersign.DuplicateSigner.selector, 0, 2));
        countersign.create(sampleHash, sDup, 0, "Title");

        // 6. Deadline in past
        vm.expectRevert(
            abi.encodeWithSelector(
                Countersign.BadDeadline.selector,
                uint64(block.timestamp - 1)
            )
        );
        countersign.create(sampleHash, s3, uint64(block.timestamp - 1), "Title");

        // 7. Deadline > 365 days
        uint64 tooFar = uint64(block.timestamp + 366 days);
        vm.expectRevert(abi.encodeWithSelector(Countersign.BadDeadline.selector, tooFar));
        countersign.create(sampleHash, s3, tooFar, "Title");

        // 8. Title too long (> 80 bytes)
        string memory longTitle = new string(81);
        vm.expectRevert(
            abi.encodeWithSelector(Countersign.TitleTooLong.selector, 81, 80)
        );
        countersign.create(sampleHash, s3, 0, longTitle);
    }

    function test_Create_CreatorNeedNotSign() public {
        address[] memory signers = _makeSigners3(); // Alice, Bob, Charlie (creator is not in signers)
        vm.prank(creator);
        uint256 id = countersign.create(sampleHash, signers, 0, "Club Rules");

        // Creator cannot sign
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(Countersign.NotASigner.selector, id, creator)
        );
        countersign.sign(id);

        // Signer can sign
        vm.prank(alice);
        countersign.sign(id);
        assertTrue(countersign.hasSigned(id, alice));
    }

    function test_Sign_SetsBitAndCount() public {
        address[] memory signers = _makeSigners3();
        vm.prank(creator);
        uint256 id = countersign.create(sampleHash, signers, 0, "Alpha Agreement");

        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit Signed(id, bob, 1, 3);
        countersign.sign(id);

        Countersign.AgreementView memory v = countersign.agreementOf(id);
        assertEq(v.signedCount, 1);
        assertEq(v.status, 0); // Still Pending
        assertTrue(countersign.hasSigned(id, bob));
        assertFalse(countersign.hasSigned(id, alice));
        assertFalse(countersign.hasSigned(id, charlie));

        (, bool[] memory signedArr) = countersign.signersOf(id);
        assertFalse(signedArr[0]);
        assertTrue(signedArr[1]);
        assertFalse(signedArr[2]);
    }

    function test_Sign_Final_Completes_EmitsBoth() public {
        address[] memory signers = _makeSigners3();
        vm.prank(creator);
        uint256 id = countersign.create(sampleHash, signers, 0, "Finality Test");

        vm.prank(alice);
        countersign.sign(id);

        vm.prank(bob);
        countersign.sign(id);

        // Third and final signature
        vm.prank(charlie);
        vm.expectEmit(true, true, false, true);
        emit Signed(id, charlie, 3, 3);
        vm.expectEmit(true, true, false, true);
        emit Completed(id, sampleHash, uint64(block.timestamp));
        countersign.sign(id);

        Countersign.AgreementView memory v = countersign.agreementOf(id);
        assertEq(v.signedCount, 3);
        assertEq(v.status, 1); // Completed
        assertEq(v.completedAt, uint64(block.timestamp));
    }

    function test_Sign_NotASigner() public {
        address[] memory signers = _makeSigners3();
        vm.prank(creator);
        uint256 id = countersign.create(sampleHash, signers, 0, "Access Check");

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Countersign.NotASigner.selector, id, stranger)
        );
        countersign.sign(id);
    }

    function test_Sign_Twice_AlreadySigned() public {
        address[] memory signers = _makeSigners3();
        vm.prank(creator);
        uint256 id = countersign.create(sampleHash, signers, 0, "Double Sign");

        vm.prank(alice);
        countersign.sign(id);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Countersign.AlreadySigned.selector, id, alice)
        );
        countersign.sign(id);
    }

    function test_Sign_AfterDeadline() public {
        address[] memory signers = _makeSigners3();
        uint64 deadline = uint64(block.timestamp + 7 days);
        vm.prank(creator);
        uint256 id = countersign.create(sampleHash, signers, deadline, "Deadline Test");

        vm.prank(alice);
        countersign.sign(id);

        // Warp past deadline
        vm.warp(deadline + 1);

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(Countersign.PastDeadline.selector, id, deadline)
        );
        countersign.sign(id);

        Countersign.AgreementView memory v = countersign.agreementOf(id);
        assertEq(v.status, 3); // Expired
    }

    function test_Sign_AfterDecline_NotPending() public {
        address[] memory signers = _makeSigners3();
        vm.prank(creator);
        uint256 id = countersign.create(sampleHash, signers, 0, "Decline First");

        vm.prank(bob);
        countersign.decline(id);

        // Alice tries to sign after bob declined
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Countersign.NotPending.selector, id, 2)
        );
        countersign.sign(id);
    }

    function test_Decline_BlocksCompletion() public {
        address[] memory signers = _makeSigners3();
        vm.prank(creator);
        uint256 id = countersign.create(sampleHash, signers, 0, "Decline Event");

        vm.prank(alice);
        countersign.sign(id);

        vm.prank(bob);
        vm.expectEmit(true, true, false, false);
        emit Declined(id, bob);
        countersign.decline(id);

        Countersign.AgreementView memory v = countersign.agreementOf(id);
        assertEq(v.status, 2); // Declined
        assertEq(v.declinedBy, bob);
        assertEq(v.completedAt, 0);
    }

    function test_Decline_AfterSigning_Reverts() public {
        address[] memory signers = _makeSigners3();
        vm.prank(creator);
        uint256 id = countersign.create(sampleHash, signers, 0, "Decline Signed");

        vm.prank(alice);
        countersign.sign(id);

        // Alice cannot decline after signing
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Countersign.AlreadySigned.selector, id, alice)
        );
        countersign.decline(id);
    }

    function test_Status_AllFour() public {
        address[] memory signers = _makeSigners3();

        // 0. Pending
        vm.prank(creator);
        uint256 id0 = countersign.create(sampleHash, signers, 0, "0");
        assertEq(countersign.agreementOf(id0).status, 0);

        // 1. Completed
        vm.prank(creator);
        uint256 id1 = countersign.create(sampleHash, signers, 0, "1");
        vm.prank(alice);
        countersign.sign(id1);
        vm.prank(bob);
        countersign.sign(id1);
        vm.prank(charlie);
        countersign.sign(id1);
        assertEq(countersign.agreementOf(id1).status, 1);

        // 2. Declined
        vm.prank(creator);
        uint256 id2 = countersign.create(sampleHash, signers, 0, "2");
        vm.prank(alice);
        countersign.decline(id2);
        assertEq(countersign.agreementOf(id2).status, 2);

        // 3. Expired
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(creator);
        uint256 id3 = countersign.create(sampleHash, signers, deadline, "3");
        vm.warp(deadline + 10);
        assertEq(countersign.agreementOf(id3).status, 3);
    }

    function test_ByDoc_MultipleAgreementsSameHash() public {
        address[] memory s = _makeSigners3();
        vm.prank(creator);
        uint256 id1 = countersign.create(sampleHash, s, 0, "Version 1");
        uint256 id2 = countersign.create(sampleHash, s, 0, "Version 2");

        Countersign.AgreementView[] memory docViews = countersign.agreementsForDoc(
            sampleHash,
            0,
            10
        );
        assertEq(docViews.length, 2);
        assertEq(docViews[0].id, id2); // newest first
        assertEq(docViews[1].id, id1);
    }

    function test_AgreementsFor_Pagination_CreatorAndSigners() public {
        address[] memory s = _makeSigners3();
        vm.startPrank(creator);
        for (uint256 i = 0; i < 5; i++) {
            countersign.create(sampleHash, s, 0, "Ag");
        }
        vm.stopPrank();

        // Creator pagination: page 1 (2 items)
        Countersign.AgreementView[] memory page1 = countersign.agreementsFor(
            creator,
            0,
            2
        );
        assertEq(page1.length, 2);
        assertEq(page1[0].id, 5);
        assertEq(page1[1].id, 4);

        // Creator page 2 (offset 2, count 2)
        Countersign.AgreementView[] memory page2 = countersign.agreementsFor(
            creator,
            2,
            2
        );
        assertEq(page2.length, 2);
        assertEq(page2[0].id, 3);
        assertEq(page2[1].id, 2);

        // Alice (signer) pagination
        Countersign.AgreementView[] memory alicePage = countersign.agreementsFor(
            alice,
            0,
            10
        );
        assertEq(alicePage.length, 5);
    }

    function testFuzz_BitmapMatchesCount(uint32 signBitsRaw) public {
        uint32 signBits = signBitsRaw & 0xFFFFF;
        address[] memory signers = new address[](20);
        for (uint160 i = 0; i < 20; i++) {
            signers[i] = address(0x2000 + i);
        }

        vm.prank(creator);
        uint256 id = countersign.create(sampleHash, signers, 0, "Fuzz 20 Signers");

        uint8 expectedCount = 0;
        for (uint256 i = 0; i < 20; i++) {
            if ((signBits & (1 << i)) != 0) {
                vm.prank(signers[i]);
                countersign.sign(id);
                expectedCount++;
            }
        }

        Countersign.AgreementView memory v = countersign.agreementOf(id);
        assertEq(v.signedCount, expectedCount);
        if (expectedCount == 20) {
            assertEq(v.status, 1); // Completed
        } else {
            assertEq(v.status, 0); // Pending
        }
    }

    function test_NoBalance() public view {
        assertEq(address(countersign).balance, 0);
    }

    function test_GasCeilings() public {
        address[] memory s5 = new address[](5);
        s5[0] = alice;
        s5[1] = bob;
        s5[2] = charlie;
        s5[3] = dave;
        s5[4] = address(0x999);

        vm.prank(creator);
        uint256 g0 = gasleft();
        uint256 id = countersign.create(sampleHash, s5, 0, "Gas Ceiling Test");
        uint256 gasCreate = g0 - gasleft();
        assertLt(gasCreate, 750_000);

        vm.prank(alice);
        g0 = gasleft();
        countersign.sign(id);
        uint256 gasSign = g0 - gasleft();
        assertLt(gasSign, 70_000);

        vm.prank(bob);
        countersign.sign(id);
        vm.prank(charlie);
        countersign.sign(id);
        vm.prank(dave);
        countersign.sign(id);

        // Final sign
        vm.prank(address(0x999));
        g0 = gasleft();
        countersign.sign(id);
        uint256 gasFinalSign = g0 - gasleft();
        assertLt(gasFinalSign, 90_000);
    }
}
