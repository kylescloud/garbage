// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IUniswapV2Factory
 * @notice Interface for Uniswap V2 Factory contract
 * @dev Used to query pairs and create new pairs
 */
interface IUniswapV2Factory {
    /**
     * @notice Emitted when a new pair is created
     */
    event PairCreated(address indexed token0, address indexed token1, address pair, uint256);

    /**
     * @notice Returns the address that receives protocol fees
     */
    function feeTo() external view returns (address);

    /**
     * @notice Returns the address that can set feeTo
     */
    function feeToSetter() external view returns (address);

    /**
     * @notice Returns the pair address for two tokens
     * @param tokenA Address of first token
     * @param tokenB Address of second token
     * @return pair Address of the pair contract, or address(0) if not created
     */
    function getPair(address tokenA, address tokenB) external view returns (address pair);

    /**
     * @notice Returns the address of the pair at the given index
     * @param index Index in the pairs array
     * @return pair Address of the pair
     */
    function allPairs(uint256 index) external view returns (address pair);

    /**
     * @notice Returns the total number of pairs created
     * @return length Number of pairs
     */
    function allPairsLength() external view returns (uint256);

    /**
     * @notice Creates a new pair for two tokens
     * @param tokenA Address of first token
     * @param tokenB Address of second token
     * @return pair Address of the newly created pair
     */
    function createPair(address tokenA, address tokenB) external returns (address pair);

    /**
     * @notice Sets the feeTo address
     * @param _feeTo New feeTo address
     */
    function setFeeTo(address _feeTo) external;

    /**
     * @notice Sets the feeToSetter address
     * @param _feeToSetter New feeToSetter address
     */
    function setFeeToSetter(address _feeToSetter) external;
}
