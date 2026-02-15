// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReentrancyGuard
 * @notice Protects against reentrancy attacks
 * @dev Implements the checks-effects-interactions pattern
 * 
 * Security Model:
 * - Uses a state variable (_status) to track execution state
 * - ENTERED (2) during execution
 * - NOT_ENTERED (1) when idle
 * - First call sets to ENTERED, subsequent reentrant calls revert
 * - Guard is released after function completes
 * 
 * Gas Cost:
 * - First call: ~2100 gas (SSTORE from non-zero to non-zero)
 * - Subsequent calls: ~100 gas (SLOAD)
 * - Release: ~100 gas (SSTORE from non-zero to non-zero)
 */
abstract contract ReentrancyGuard {
    
    // ============ State Variables ============
    
    /// @notice Reentrancy status
    /// @dev 1 = NOT_ENTERED, 2 = ENTERED
    uint256 private _status;
    
    /// @notice Status constants
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    
    // ============ Errors ============
    
    /// @notice Thrown when reentrancy is detected
    error ReentrancyDetected();
    
    // ============ Constructor ============
    
    /**
     * @notice Initialize guard in NOT_ENTERED state
     * @dev Sets initial status to 1
     */
    constructor() {
        _status = NOT_ENTERED;
    }
    
    // ============ Modifiers ============
    
    /**
     * @notice Prevents reentrancy attacks
     * @dev Guards function execution with status check
     * 
     * Usage:
     * ```solidity
     * function executeArbitrage() external nonReentrant {
     *     // Function body
     * }
     * ```
     * 
     * Execution flow:
     * 1. Check _status == NOT_ENTERED (reverts if ENTERED)
     * 2. Set _status = ENTERED
     * 3. Execute function body
     * 4. Set _status = NOT_ENTERED
     */
    modifier nonReentrant() {
        // Check if already entered
        if (_status == ENTERED) {
            revert ReentrancyDetected();
        }
        
        // Set status to entered
        _status = ENTERED;
        
        // Execute function
        _;
        
        // Reset status
        _status = NOT_ENTERED;
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Check if guard is currently locked
     * @dev Returns true if function is executing
     * @return locked True if reentrancy guard is active
     */
    function _isLocked() internal view returns (bool locked) {
        locked = (_status == ENTERED);
    }
}

/**
 * @title ReentrancyGuardTransient
 * @notice Gas-optimized reentrancy guard using transient storage (EIP-1153)
 * @dev Uses TLOAD/TSTORE for cheaper gas costs
 * 
 * Gas Savings:
 * - TSTORE: 100 gas (vs 20000 for first SSTORE)
 * - TLOAD: 100 gas (same as SLOAD)
 * - Total savings: ~20000 gas per guarded function
 * 
 * Requirements:
 * - Solidity >= 0.8.24
 * - EVM with EIP-1153 support (Cancun fork)
 * 
 * Note: Only use this on chains with EIP-1153 support.
 * For Base, check if Cancun upgrade is active.
 */
abstract contract ReentrancyGuardTransient {
    
    // ============ Errors ============
    
    error ReentrancyDetected();
    
    // ============ Transient Storage ============
    
    /// @notice Transient storage slot for reentrancy status
    /// @dev Uses transient storage (EIP-1153)
    bytes32 private constant REENTRANCY_GUARD_SLOT = keccak256("ReentrancyGuard.status");
    
    // ============ Modifiers ============
    
    /**
     * @notice Gas-optimized nonReentrant modifier
     * @dev Uses transient storage for 20k gas savings
     */
    modifier nonReentrant() {
        // Load status from transient storage
        uint256 status;
        bytes32 slot = REENTRANCY_GUARD_SLOT;
        
        assembly {
            status := tload(slot)
        }
        
        // Check if already entered
        if (status == 2) {
            revert ReentrancyDetected();
        }
        
        // Set status to entered
        assembly {
            tstore(slot, 2)
        }
        
        // Execute function
        _;
        
        // Reset status (transient storage auto-clears at end of transaction)
        assembly {
            tstore(slot, 1)
        }
    }
}

/**
 * @title ReentrancyGuardMultiple
 * @notice Advanced guard for contracts with multiple protected entry points
 * @dev Supports multiple independent locks
 * 
 * Use Case:
 * - Contract has multiple functions that should not reenter themselves
 * - But CAN call each other without reverting
 * 
 * Example:
 * ```solidity
 * function deposit() external nonReentrant(0) {
 *     _mint(msg.sender, amount);
 *     vault.stake(); // Can call withdraw()
 * }
 * 
 * function withdraw() external nonReentrant(1) {
 *     _burn(msg.sender, amount);
 *     // Cannot reenter withdraw()
 * }
 * ```
 */
abstract contract ReentrancyGuardMultiple {
    
    // ============ State Variables ============
    
    /// @notice Bitmap of lock states (256 independent locks)
    uint256 private _locks;
    
    // ============ Errors ============
    
    error ReentrancyDetected(uint8 lockId);
    error InvalidLockId(uint8 lockId);
    
    // ============ Modifiers ============
    
    /**
     * @notice Lock-specific nonReentrant modifier
     * @dev Uses bitmap to track multiple independent locks
     * @param lockId Lock identifier (0-255)
     */
    modifier nonReentrant(uint8 lockId) {
        if (lockId >= 256) revert InvalidLockId(lockId);
        
        // Check if this specific lock is active
        uint256 mask = 1 << lockId;
        if (_locks & mask != 0) {
            revert ReentrancyDetected(lockId);
        }
        
        // Set lock
        _locks |= mask;
        
        // Execute function
        _;
        
        // Clear lock
        _locks &= ~mask;
    }
    
    /**
     * @notice Check if specific lock is active
     * @param lockId Lock to check
     * @return locked True if lock is active
     */
    function _isLocked(uint8 lockId) internal view returns (bool locked) {
        uint256 mask = 1 << lockId;
        locked = (_locks & mask != 0);
    }
}
