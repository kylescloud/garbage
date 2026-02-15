// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IUniswapV3Router
 * @notice Interface for Uniswap V3 SwapRouter
 * @dev Used for multi-hop V3 swaps with exact input/output
 */
interface IUniswapV3Router {
    
    // ============ Structs ============
    
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }
    
    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }
    
    struct ExactOutputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
    }
    
    // ============ Functions ============
    
    /**
     * @notice Swap exact input for output (single hop)
     * @param params Swap parameters
     * @return amountOut Output amount
     */
    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);
    
    /**
     * @notice Swap exact input for output (multi-hop)
     * @param params Swap parameters
     * @return amountOut Output amount
     */
    function exactInput(
        ExactInputParams calldata params
    ) external payable returns (uint256 amountOut);
    
    /**
     * @notice Swap for exact output (single hop)
     * @param params Swap parameters
     * @return amountIn Input amount
     */
    function exactOutputSingle(
        ExactOutputSingleParams calldata params
    ) external payable returns (uint256 amountIn);
    
    /**
     * @notice Swap for exact output (multi-hop)
     * @param params Swap parameters
     * @return amountIn Input amount
     */
    function exactOutput(
        ExactOutputParams calldata params
    ) external payable returns (uint256 amountIn);
}
