// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IUniswapV3SwapCallback
 * @notice Interface for Uniswap V3 swap callback
 * @dev Any contract that calls IUniswapV3Pool#swap must implement this interface
 */
interface IUniswapV3SwapCallback {
    /**
     * @notice Called on msg.sender after executing a swap via IUniswapV3Pool#swap
     * @dev In the implementation you must pay the pool tokens owed for the swap
     * The caller of this method must be checked to be a UniswapV3Pool deployed by the canonical factory
     * amount0Delta and amount1Delta can both be 0 if no tokens were swapped
     * @param amount0Delta The amount of token0 that was sent (negative) or must be received (positive) by the pool
     * @param amount1Delta The amount of token1 that was sent (negative) or must be received (positive) by the pool
     * @param data Any data passed through by the caller via the IUniswapV3Pool#swap call
     */
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external;
}
