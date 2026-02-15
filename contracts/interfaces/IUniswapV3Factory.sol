// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IUniswapV3Factory
 * @notice Interface for Uniswap V3 Factory contract
 * @dev Used to query pools and create new pools
 */
interface IUniswapV3Factory {
    /**
     * @notice Emitted when a pool is created
     */
    event PoolCreated(
        address indexed token0,
        address indexed token1,
        uint24 indexed fee,
        int24 tickSpacing,
        address pool
    );

    /**
     * @notice Emitted when a new fee amount is enabled for pool creation
     */
    event FeeAmountEnabled(uint24 indexed fee, int24 indexed tickSpacing);

    /**
     * @notice Returns the current owner of the factory
     */
    function owner() external view returns (address);

    /**
     * @notice Returns the tick spacing for a given fee amount
     * @param fee The fee amount
     * @return The tick spacing
     */
    function feeAmountTickSpacing(uint24 fee) external view returns (int24);

    /**
     * @notice Returns the pool address for a given pair of tokens and a fee
     * @param tokenA Address of first token
     * @param tokenB Address of second token
     * @param fee The fee collected upon every swap
     * @return pool The pool address, or address(0) if it does not exist
     */
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);

    /**
     * @notice Creates a pool for the given two tokens and fee
     * @param tokenA One of the two tokens in the pool
     * @param tokenB The other token in the pool
     * @param fee The desired fee for the pool
     * @return pool The address of the newly created pool
     */
    function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool);

    /**
     * @notice Updates the owner of the factory
     * @param _owner The new owner address
     */
    function setOwner(address _owner) external;

    /**
     * @notice Enables a fee amount with the given tickSpacing
     * @param fee The fee amount to enable
     * @param tickSpacing The spacing between usable ticks
     */
    function enableFeeAmount(uint24 fee, int24 tickSpacing) external;
}
