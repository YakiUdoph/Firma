// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @notice Immutable registry for commitments to off-chain FIRMA reports.
/// @dev A record proves only that an address submitted a hash by a chain block.
contract FirmaEvidenceRegistry {
    struct Record {
        address submitter;
        uint64 recordedBlock;
        uint64 recordedAt;
    }

    error ZeroCommitment();
    error CommitmentAlreadyExists(bytes32 commitment);

    event ReportCommitted(
        bytes32 indexed commitment,
        address indexed submitter,
        uint256 recordedBlock,
        uint256 recordedAt
    );

    mapping(bytes32 commitment => Record record) private records;

    function commit(bytes32 commitment) external {
        if (commitment == bytes32(0)) revert ZeroCommitment();
        if (records[commitment].submitter != address(0)) {
            revert CommitmentAlreadyExists(commitment);
        }

        records[commitment] = Record({
            submitter: msg.sender,
            recordedBlock: uint64(block.number),
            recordedAt: uint64(block.timestamp)
        });

        emit ReportCommitted(commitment, msg.sender, block.number, block.timestamp);
    }

    function get(bytes32 commitment)
        external
        view
        returns (address submitter, uint64 recordedBlock, uint64 recordedAt, bool exists)
    {
        Record memory record = records[commitment];
        return (
            record.submitter,
            record.recordedBlock,
            record.recordedAt,
            record.submitter != address(0)
        );
    }
}
