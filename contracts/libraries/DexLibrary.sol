// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IUniswapV2Pair.sol";
import "../interfaces/IUniswapV3Pool.sol";
import "../interfaces/IERC20.sol";

/**
 * @title DexLibrary
 * @notice Helper library for DEX interactions (V2 and V3)
 * @dev Provides swap execution and amount calculation functions
 * 
 * Mathematical Foundation:
 * 
 * Uniswap V2 (Constant Product):
 * - Invariant: x × y = k
 * - AmountOut = (AmountIn × 997 × reserveOut) / (reserveIn × 1000 + AmountIn × 997)
 * 
 * Uniswap V3 (Concentrated Liquidity):
 * - Price: √P = √(y/x)
 * - AmountOut depends on liquidity and price movement across ticks
 */
library DexLibrary {
    
    // ============ Constants ============
    
    /// @notice Uniswap V2 fee (0.3%)
    uint256 private constant V2_FEE_DENOMINATOR = 1000;
    uint256 private constant V2_FEE_NUMERATOR = 997;
    
    // ============ Errors ============
    
    error InsufficientReserves();
    error InsufficientOutputAmount();
    error InvalidPath();
    error ZeroAddress();
    
    // ============ Uniswap V2 Functions ============
    
    /**
     * @notice Calculate output amount for Uniswap V2 swap
     * @dev Formula: amountOut = (amountIn × 997 × reserveOut) / (reserveIn × 1000 + amountIn × 997)
     * @param amountIn Input token amount
     * @param reserveIn Reserve of input token
     * @param reserveOut Reserve of output token
     * @return amountOut Output token amount
     */
    function getV2AmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        if (amountIn == 0) revert InsufficientOutputAmount();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientReserves();
        
        uint256 amountInWithFee = amountIn * V2_FEE_NUMERATOR;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * V2_FEE_DENOMINATOR) + amountInWithFee;
        
        amountOut = numerator / denominator;
    }
    
    /**
     * @notice Execute Uniswap V2 swap
     * @dev Transfers tokens to pair, calls swap, validates output
     * @param pair Address of Uniswap V2 pair
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Input amount
     * @param amountOutMin Minimum output amount (slippage protection)
     * @param to Recipient address
     * @return amountOut Actual output amount
     */
    function executeV2Swap(
        address pair,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address to
    ) internal returns (uint256 amountOut) {
        if (pair == address(0) || tokenIn == address(0) || tokenOut == address(0)) {
            revert ZeroAddress();
        }
        
        // Get reserves
        IUniswapV2Pair pairContract = IUniswapV2Pair(pair);
        (uint112 reserve0, uint112 reserve1,) = pairContract.getReserves();
        
        // Determine token order
        address token0 = pairContract.token0();
        bool isToken0 = tokenIn == token0;
        
        (uint256 reserveIn, uint256 reserveOut) = isToken0
            ? (uint256(reserve0), uint256(reserve1))
            : (uint256(reserve1), uint256(reserve0));
        
        // Calculate expected output
        amountOut = getV2AmountOut(amountIn, reserveIn, reserveOut);
        
        if (amountOut < amountOutMin) revert InsufficientOutputAmount();
        
        // Transfer tokens to pair
        IERC20(tokenIn).transfer(pair, amountIn);
        
        // Execute swap
        (uint256 amount0Out, uint256 amount1Out) = isToken0
            ? (uint256(0), amountOut)
            : (amountOut, uint256(0));
        
        pairContract.swap(amount0Out, amount1Out, to, new bytes(0));
    }
    
    /**
     * @notice Simulate V2 swap without execution (for testing/validation)
     * @param reserveIn Reserve of input token
     * @param reserveOut Reserve of output token
     * @param amountIn Input amount
     * @return amountOut Expected output amount
     */
    function simulateV2Swap(
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 amountIn
    ) internal pure returns (uint256 amountOut) {
        return getV2AmountOut(amountIn, reserveIn, reserveOut);
    }
    
    // ============ Uniswap V3 Functions ============
    
    /**
     * @notice Execute Uniswap V3 swap
     * @dev Uses direct swap call, callback handles payment
     * @param pool Address of Uniswap V3 pool
     * @param zeroForOne Direction of swap (token0 → token1 or reverse)
     * @param amountIn Exact input amount
     * @param amountOutMin Minimum output amount (slippage protection)
     * @param sqrtPriceLimitX96 Price limit (0 = no limit)
     * @return amountOut Actual output amount
     */
    function executeV3Swap(
        address pool,
        bool zeroForOne,
        int256 amountIn,
        uint256 amountOutMin,
        uint160 sqrtPriceLimitX96
    ) internal returns (uint256 amountOut) {
        if (pool == address(0)) revert ZeroAddress();
        if (amountIn <= 0) revert InsufficientOutputAmount();
        
        // If no price limit specified, use extreme values
        if (sqrtPriceLimitX96 == 0) {
            sqrtPriceLimitX96 = zeroForOne
                ? 4295128739  // MIN_SQRT_RATIO + 1
                : 1461446703485210103287273052203988822378723970342; // MAX_SQRT_RATIO - 1
        }
        
        // Execute swap via callback pattern
        (int256 amount0, int256 amount1) = IUniswapV3Pool(pool).swap(
            address(this),
            zeroForOne,
            amountIn,
            sqrtPriceLimitX96,
            abi.encode(msg.sender) // Pass sender for callback
        );
        
        // Extract output amount (negative value is output)
        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
        
        if (amountOut < amountOutMin) revert InsufficientOutputAmount();
    }
    
    /**
     * @notice Get quote for V3 swap (read-only simulation)
     * @dev Does NOT execute swap, used for profit calculations
     * @param pool Uniswap V3 pool address
     * @param zeroForOne Swap direction
     * @param amountIn Input amount
     * @return amountOut Expected output amount (approximate)
     * 
     * NOTE: This is a simplified estimation. Actual amount depends on:
     * - Current tick and liquidity
     * - Tick crossings during swap
     * - Fee tier of pool
     * Production systems should use off-chain simulation with full tick data
     */
    function getV3AmountOut(
        address pool,
        bool zeroForOne,
        uint256 amountIn
    ) internal view returns (uint256 amountOut) {
        IUniswapV3Pool poolContract = IUniswapV3Pool(pool);
        
        // Get current sqrt price and liquidity
        (uint160 sqrtPriceX96,,,,,,) = poolContract.slot0();
        uint128 liquidity = poolContract.liquidity();
        
        // Simplified calculation (assumes single tick, no crossing)
        // For production, use V3SwapSimulator.ts for accurate multi-tick simulation
        if (zeroForOne) {
            // Calculate price impact and output
            uint256 priceX96 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96) >> 96;
            amountOut = (amountIn * priceX96) >> 96;
        } else {
            uint256 priceX96 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96) >> 96;
            amountOut = (amountIn << 96) / priceX96;
        }
        
        // Apply fee (pool fee can be 0.05%, 0.3%, or 1%)
        uint24 fee = poolContract.fee();
        amountOut = (amountOut * (1_000_000 - fee)) / 1_000_000;
    }
    
    // ============ General Helpers ============
    
    /**
     * @notice Sort two tokens by address
     * @dev Used to determine token0/token1 in pairs
     * @param tokenA First token
     * @param tokenB Second token
     * @return token0 Lower address
     * @return token1 Higher address
     */
    function sortTokens(
        address tokenA,
        address tokenB
    ) internal pure returns (address token0, address token1) {
        if (tokenA == tokenB) revert InvalidPath();
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
    }
    
    /**
     * @notice Calculate minimum amount with slippage tolerance
     * @param amount Expected amount
     * @param slippageBps Slippage in basis points (100 = 1%)
     * @return minAmount Minimum acceptable amount
     */
    function applySlippage(
        uint256 amount,
        uint256 slippageBps
    ) internal pure returns (uint256 minAmount) {
        minAmount = (amount * (10_000 - slippageBps)) / 10_000;
    }
}
