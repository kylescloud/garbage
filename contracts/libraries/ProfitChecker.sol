// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ProfitChecker
 * @notice Helper library for profit calculations and validation
 * @dev Used by FlashArbitrage contract to ensure profitable execution
 * 
 * Mathematical Foundation:
 * 
 * Net Profit Function:
 * Π(L) = F(L) - Debt(L) - Gas(L)
 * 
 * Where:
 * - L = Flash loan amount
 * - F(L) = Final balance after arbitrage path
 * - Debt(L) = L × (1 + φ) where φ = 0.0009 (9 bps Aave fee)
 * - Gas(L) = Gas cost in asset units
 * 
 * Profitability Condition:
 * Execute IFF Π(L) ≥ MinThreshold
 */
library ProfitChecker {
    
    // ============ Constants ============
    
    /// @notice Aave V3 flash loan fee (9 basis points)
    uint256 private constant FLASH_LOAN_FEE_BPS = 9;
    uint256 private constant BPS_DENOMINATOR = 10_000;
    
    /// @notice Safety margin multiplier (adds 5% buffer to calculations)
    uint256 private constant SAFETY_MARGIN_BPS = 500; // 5%
    
    // ============ Errors ============
    
    error InsufficientProfit();
    error InvalidParameters();
    error Overflow();
    
    // ============ Structs ============
    
    /**
     * @notice Profit breakdown structure
     * @param grossProfit Total output from arbitrage path
     * @param flashLoanDebt Amount to repay (principal + fee)
     * @param gasCost Estimated gas cost in asset units
     * @param netProfit Final profit after all costs
     */
    struct ProfitBreakdown {
        uint256 grossProfit;
        uint256 flashLoanDebt;
        uint256 gasCost;
        uint256 netProfit;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Calculate flash loan debt
     * @dev Debt(L) = L × (1 + 0.0009)
     * @param principal Flash loan principal amount
     * @return debt Total amount to repay
     */
    function calculateDebt(uint256 principal) internal pure returns (uint256 debt) {
        // Debt = Principal × (1 + fee)
        // Debt = Principal × (10000 + 9) / 10000
        debt = (principal * (BPS_DENOMINATOR + FLASH_LOAN_FEE_BPS)) / BPS_DENOMINATOR;
    }
    
    /**
     * @notice Calculate flash loan fee only
     * @dev Fee = L × 0.0009
     * @param principal Flash loan principal amount
     * @return fee Fee amount
     */
    function calculateFee(uint256 principal) internal pure returns (uint256 fee) {
        fee = (principal * FLASH_LOAN_FEE_BPS) / BPS_DENOMINATOR;
    }
    
    /**
     * @notice Calculate gas cost in asset units
     * @dev GasCost = gasUsed × gasPrice × assetPrice
     * @param gasUnits Expected gas units
     * @param gasPriceWei Gas price in wei
     * @param ethPriceInAsset Price of 1 ETH in terms of the asset (scaled by 1e18)
     * @return gasCost Gas cost denominated in asset
     * 
     * Example: If asset is USDC (6 decimals) and ETH = $2000
     * - gasUnits = 500000
     * - gasPriceWei = 1e9 (1 gwei)
     * - ethPriceInAsset = 2000e6 (2000 USDC per ETH)
     * - gasCost = 500000 × 1e9 × 2000e6 / 1e18 = 1e6 (1 USDC)
     */
    function calculateGasCost(
        uint256 gasUnits,
        uint256 gasPriceWei,
        uint256 ethPriceInAsset
    ) internal pure returns (uint256 gasCost) {
        // Gas cost in ETH = gasUnits × gasPriceWei
        // Gas cost in asset = (gasUnits × gasPriceWei × ethPriceInAsset) / 1e18
        uint256 gasCostWei = gasUnits * gasPriceWei;
        gasCost = (gasCostWei * ethPriceInAsset) / 1e18;
    }
    
    /**
     * @notice Calculate net profit for an arbitrage path
     * @dev Π(L) = finalBalance - debt - gasCost
     * @param finalBalance Final balance after executing path
     * @param principal Flash loan principal
     * @param gasUnits Expected gas usage
     * @param gasPriceWei Current gas price
     * @param ethPriceInAsset ETH price in asset units
     * @return breakdown Complete profit breakdown
     */
    function calculateNetProfit(
        uint256 finalBalance,
        uint256 principal,
        uint256 gasUnits,
        uint256 gasPriceWei,
        uint256 ethPriceInAsset
    ) internal pure returns (ProfitBreakdown memory breakdown) {
        breakdown.grossProfit = finalBalance;
        breakdown.flashLoanDebt = calculateDebt(principal);
        breakdown.gasCost = calculateGasCost(gasUnits, gasPriceWei, ethPriceInAsset);
        
        // Net profit = gross - debt - gas
        if (finalBalance >= breakdown.flashLoanDebt + breakdown.gasCost) {
            breakdown.netProfit = finalBalance - breakdown.flashLoanDebt - breakdown.gasCost;
        } else {
            breakdown.netProfit = 0;
        }
    }
    
    /**
     * @notice Check if profit meets minimum threshold
     * @dev Includes safety margin for slippage and price movement
     * @param netProfit Calculated net profit
     * @param minThreshold Minimum required profit
     * @return meetsThreshold True if profit sufficient
     */
    function meetsThreshold(
        uint256 netProfit,
        uint256 minThreshold
    ) internal pure returns (bool) {
        // Apply safety margin to threshold
        uint256 adjustedThreshold = (minThreshold * (BPS_DENOMINATOR + SAFETY_MARGIN_BPS)) / BPS_DENOMINATOR;
        
        return netProfit >= adjustedThreshold;
    }
    
    /**
     * @notice Check if execution is profitable
     * @dev Complete profitability check with all parameters
     * @param finalBalance Expected final balance
     * @param principal Flash loan amount
     * @param gasUnits Gas estimate
     * @param gasPriceWei Gas price
     * @param ethPriceInAsset ETH price in asset
     * @param minThreshold Minimum profit threshold
     * @return isProfitable True if meets all conditions
     * @return breakdown Detailed profit breakdown
     */
    function isProfitable(
        uint256 finalBalance,
        uint256 principal,
        uint256 gasUnits,
        uint256 gasPriceWei,
        uint256 ethPriceInAsset,
        uint256 minThreshold
    ) internal pure returns (bool isProfitable, ProfitBreakdown memory breakdown) {
        breakdown = calculateNetProfit(
            finalBalance,
            principal,
            gasUnits,
            gasPriceWei,
            ethPriceInAsset
        );
        
        isProfitable = meetsThreshold(breakdown.netProfit, minThreshold);
    }
    
    // ============ Optimization Helpers ============
    
    /**
     * @notice Calculate break-even flash loan amount
     * @dev Find L where Π(L) = 0 (useful for understanding minimum viable size)
     * @param outputRatio Output/input ratio of the path (scaled by 1e18)
     * @param gasCost Gas cost in asset units
     * @return breakEvenAmount Minimum loan amount to break even
     * 
     * Derivation:
     * At break-even: F(L) = Debt(L) + Gas
     * L × R = L × (1 + φ) + G
     * L × R - L × (1 + φ) = G
     * L × (R - 1 - φ) = G
     * L = G / (R - 1 - φ)
     * 
     * Where:
     * - R = outputRatio (e.g., 1.01 = 1% profit before fees)
     * - φ = flash loan fee (0.0009)
     * - G = gas cost
     */
    function calculateBreakEven(
        uint256 outputRatio,
        uint256 gasCost
    ) internal pure returns (uint256 breakEvenAmount) {
        if (outputRatio <= 1e18 + (FLASH_LOAN_FEE_BPS * 1e18 / BPS_DENOMINATOR)) {
            // Path is never profitable (output ratio too low)
            return type(uint256).max;
        }
        
        // Calculate denominator: (R - 1 - φ)
        uint256 netRatio = outputRatio - 1e18 - ((FLASH_LOAN_FEE_BPS * 1e18) / BPS_DENOMINATOR);
        
        // breakEven = gasCost / netRatio (scaled back)
        breakEvenAmount = (gasCost * 1e18) / netRatio;
    }
    
    /**
     * @notice Estimate optimal loan amount
     * @dev Simple linear approximation (for quick estimates)
     * @param outputRatio Output/input ratio
     * @param gasCost Gas cost
     * @param desiredProfit Target profit
     * @return optimalAmount Estimated optimal loan size
     * 
     * Linear approximation:
     * L = (G + P) / (R - 1 - φ)
     * 
     * Note: This is simplified. Production systems should use
     * Newton-Raphson optimization from Phase 4 for exact results.
     */
    function estimateOptimalAmount(
        uint256 outputRatio,
        uint256 gasCost,
        uint256 desiredProfit
    ) internal pure returns (uint256 optimalAmount) {
        if (outputRatio <= 1e18 + ((FLASH_LOAN_FEE_BPS * 1e18) / BPS_DENOMINATOR)) {
            return 0;
        }
        
        uint256 netRatio = outputRatio - 1e18 - ((FLASH_LOAN_FEE_BPS * 1e18) / BPS_DENOMINATOR);
        uint256 totalCost = gasCost + desiredProfit;
        
        optimalAmount = (totalCost * 1e18) / netRatio;
    }
    
    // ============ Validation Helpers ============
    
    /**
     * @notice Validate profit parameters before calculation
     * @dev Ensures no overflow or invalid inputs
     * @param finalBalance Final balance
     * @param principal Loan amount
     * @param gasUnits Gas estimate
     * @param gasPriceWei Gas price
     * @return isValid True if parameters valid
     */
    function validateParameters(
        uint256 finalBalance,
        uint256 principal,
        uint256 gasUnits,
        uint256 gasPriceWei
    ) internal pure returns (bool isValid) {
        // Check for zero values
        if (principal == 0) return false;
        
        // Check for reasonable gas parameters
        if (gasUnits > 10_000_000) return false; // Max 10M gas
        if (gasPriceWei > 1000e9) return false; // Max 1000 gwei
        
        // Check for potential overflow in debt calculation
        uint256 maxDebt = (principal * (BPS_DENOMINATOR + FLASH_LOAN_FEE_BPS)) / BPS_DENOMINATOR;
        if (maxDebt < principal) return false; // Overflow check
        
        return true;
    }
    
    /**
     * @notice Apply slippage to expected output
     * @dev Reduces output by slippage percentage
     * @param expectedOutput Expected output amount
     * @param slippageBps Slippage tolerance in bps
     * @return minOutput Minimum acceptable output
     */
    function applySlippage(
        uint256 expectedOutput,
        uint256 slippageBps
    ) internal pure returns (uint256 minOutput) {
        minOutput = (expectedOutput * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR;
    }
    
    /**
     * @notice Calculate profit margin as percentage
     * @dev Returns profit margin in basis points
     * @param netProfit Net profit amount
     * @param principal Principal amount
     * @return marginBps Profit margin in bps
     * 
     * Margin = (NetProfit / Principal) × 10000
     */
    function calculateMargin(
        uint256 netProfit,
        uint256 principal
    ) internal pure returns (uint256 marginBps) {
        if (principal == 0) return 0;
        
        marginBps = (netProfit * BPS_DENOMINATOR) / principal;
    }
}
