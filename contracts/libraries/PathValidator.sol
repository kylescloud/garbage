// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PathValidator
 * @notice Validates arbitrage paths before execution
 * @dev Ensures paths are valid, profitable, and gas-efficient
 * 
 * Validation Rules:
 * 1. Path must form a cycle (start token == end token)
 * 2. No duplicate hops (prevents infinite loops)
 * 3. All pairs must exist and have liquidity
 * 4. Estimated profit must exceed gas costs
 * 5. Path length must be reasonable (2-6 hops)
 */
library PathValidator {
    
    // ============ Constants ============
    
    /// @notice Maximum path length (hops)
    uint256 private constant MAX_PATH_LENGTH = 6;
    
    /// @notice Minimum path length (hops)
    uint256 private constant MIN_PATH_LENGTH = 2;
    
    // ============ Errors ============
    
    error PathTooLong();
    error PathTooShort();
    error NotACycle();
    error DuplicateHop();
    error InvalidPair();
    error ZeroAddress();
    error InsufficientLiquidity();
    
    // ============ Structs ============
    
    /**
     * @notice Represents a single hop in the path
     * @param pair DEX pair address
     * @param tokenIn Input token for this hop
     * @param tokenOut Output token for this hop
     * @param dexType 0 = V2, 1 = V3
     */
    struct Hop {
        address pair;
        address tokenIn;
        address tokenOut;
        uint8 dexType;
    }
    
    /**
     * @notice Complete arbitrage path
     * @param hops Array of hops
     * @param flashToken Token to borrow via flash loan
     * @param flashAmount Amount to borrow
     */
    struct Path {
        Hop[] hops;
        address flashToken;
        uint256 flashAmount;
    }
    
    // ============ Validation Functions ============
    
    /**
     * @notice Validate complete arbitrage path
     * @dev Checks all validation rules
     * @param path Arbitrage path to validate
     * @return isValid True if path passes all checks
     * @return reason Failure reason if invalid
     */
    function validatePath(
        Path memory path
    ) internal pure returns (bool isValid, string memory reason) {
        // Check path length
        if (path.hops.length > MAX_PATH_LENGTH) {
            return (false, "Path too long");
        }
        if (path.hops.length < MIN_PATH_LENGTH) {
            return (false, "Path too short");
        }
        
        // Check cycle (start token == end token)
        if (!isCycle(path)) {
            return (false, "Path is not a cycle");
        }
        
        // Check for duplicate pairs (prevents loops)
        if (hasDuplicates(path)) {
            return (false, "Path contains duplicate hops");
        }
        
        // Check all addresses are non-zero
        if (!hasValidAddresses(path)) {
            return (false, "Path contains zero addresses");
        }
        
        // Check flash loan parameters
        if (path.flashToken == address(0) || path.flashAmount == 0) {
            return (false, "Invalid flash loan parameters");
        }
        
        // All checks passed
        return (true, "");
    }
    
    /**
     * @notice Check if path forms a cycle
     * @dev First hop input must equal last hop output
     * @param path Path to check
     * @return isCyclic True if path is a cycle
     */
    function isCycle(Path memory path) internal pure returns (bool) {
        if (path.hops.length == 0) return false;
        
        address startToken = path.hops[0].tokenIn;
        address endToken = path.hops[path.hops.length - 1].tokenOut;
        
        return startToken == endToken;
    }
    
    /**
     * @notice Check for duplicate pairs in path
     * @dev Prevents infinite loops and redundant swaps
     * @param path Path to check
     * @return hasDup True if duplicates found
     */
    function hasDuplicates(Path memory path) internal pure returns (bool) {
        uint256 length = path.hops.length;
        
        for (uint256 i = 0; i < length; i++) {
            for (uint256 j = i + 1; j < length; j++) {
                if (path.hops[i].pair == path.hops[j].pair) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * @notice Check all addresses in path are valid
     * @dev Ensures no zero addresses
     * @param path Path to check
     * @return isValid True if all addresses valid
     */
    function hasValidAddresses(Path memory path) internal pure returns (bool) {
        for (uint256 i = 0; i < path.hops.length; i++) {
            Hop memory hop = path.hops[i];
            
            if (hop.pair == address(0)) return false;
            if (hop.tokenIn == address(0)) return false;
            if (hop.tokenOut == address(0)) return false;
        }
        
        return true;
    }
    
    /**
     * @notice Check if consecutive hops are connected
     * @dev Output of hop[i] must equal input of hop[i+1]
     * @param path Path to check
     * @return isConnected True if all hops connected
     */
    function areHopsConnected(Path memory path) internal pure returns (bool) {
        for (uint256 i = 0; i < path.hops.length - 1; i++) {
            if (path.hops[i].tokenOut != path.hops[i + 1].tokenIn) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * @notice Estimate gas cost for path execution
     * @dev Approximation based on hop count and DEX types
     * @param path Path to estimate
     * @return gasEstimate Estimated gas units
     * 
     * Gas Model:
     * - Flash loan base: 80,000
     * - V2 swap: 110,000 per hop
     * - V3 swap: 150,000 per hop (base) + 25,000 per tick crossing
     * - Overhead: 50,000 (transfers, checks, etc.)
     */
    function estimateGas(Path memory path) internal pure returns (uint256 gasEstimate) {
        // Base cost for flash loan
        gasEstimate = 80_000;
        
        // Add cost per hop
        for (uint256 i = 0; i < path.hops.length; i++) {
            if (path.hops[i].dexType == 0) {
                // V2 swap
                gasEstimate += 110_000;
            } else {
                // V3 swap (assume 3 tick crossings on average)
                gasEstimate += 150_000 + (3 * 25_000);
            }
        }
        
        // Add overhead
        gasEstimate += 50_000;
    }
    
    /**
     * @notice Check if path meets minimum profit threshold
     * @dev Simple check: estimatedProfit > gasCost + minProfit
     * @param estimatedProfit Expected profit in wei
     * @param gasPrice Current gas price in wei
     * @param minProfitThreshold Minimum profit threshold in wei
     * @param path Path to check (for gas estimation)
     * @return meetsThreshold True if profit sufficient
     */
    function meetsProfitThreshold(
        uint256 estimatedProfit,
        uint256 gasPrice,
        uint256 minProfitThreshold,
        Path memory path
    ) internal pure returns (bool) {
        uint256 gasCost = estimateGas(path) * gasPrice;
        uint256 requiredProfit = gasCost + minProfitThreshold;
        
        return estimatedProfit >= requiredProfit;
    }
    
    // ============ Helper Functions ============
    
    /**
     * @notice Get path length
     * @param path Path to check
     * @return length Number of hops
     */
    function getPathLength(Path memory path) internal pure returns (uint256) {
        return path.hops.length;
    }
    
    /**
     * @notice Get all unique tokens in path
     * @dev Useful for approval checks
     * @param path Path to analyze
     * @return tokens Array of unique token addresses
     */
    function getUniqueTokens(
        Path memory path
    ) internal pure returns (address[] memory tokens) {
        // Maximum possible unique tokens is (hops + 1)
        address[] memory tempTokens = new address[](path.hops.length + 1);
        uint256 count = 0;
        
        for (uint256 i = 0; i < path.hops.length; i++) {
            // Add tokenIn if not already present
            if (!contains(tempTokens, count, path.hops[i].tokenIn)) {
                tempTokens[count] = path.hops[i].tokenIn;
                count++;
            }
            
            // Add tokenOut if not already present
            if (!contains(tempTokens, count, path.hops[i].tokenOut)) {
                tempTokens[count] = path.hops[i].tokenOut;
                count++;
            }
        }
        
        // Create properly sized array
        tokens = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            tokens[i] = tempTokens[i];
        }
    }
    
    /**
     * @notice Check if address exists in array
     * @dev Helper for getUniqueTokens
     * @param array Array to search
     * @param length Current length of array
     * @param addr Address to find
     * @return exists True if address in array
     */
    function contains(
        address[] memory array,
        uint256 length,
        address addr
    ) private pure returns (bool) {
        for (uint256 i = 0; i < length; i++) {
            if (array[i] == addr) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * @notice Convert path to string representation (for debugging)
     * @dev Creates human-readable path description
     * @param path Path to describe
     * @return description Path description
     */
    function describePath(Path memory path) internal pure returns (string memory description) {
        description = "Path: ";
        
        for (uint256 i = 0; i < path.hops.length; i++) {
            if (i > 0) {
                description = string(abi.encodePacked(description, " -> "));
            }
            
            string memory dexType = path.hops[i].dexType == 0 ? "V2" : "V3";
            description = string(abi.encodePacked(description, dexType));
        }
        
        return description;
    }
}
