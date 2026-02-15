// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IUniswapV2Pair
 * @notice Interface for Uniswap V2 Pair contract
 * @dev Complete interface for pair interactions
 */
interface IUniswapV2Pair {
    /**
     * @notice Returns the name of the pair token
     */
    function name() external pure returns (string memory);

    /**
     * @notice Returns the symbol of the pair token
     */
    function symbol() external pure returns (string memory);

    /**
     * @notice Returns the number of decimals (always 18 for LP tokens)
     */
    function decimals() external pure returns (uint8);

    /**
     * @notice Returns the total supply of LP tokens
     */
    function totalSupply() external view returns (uint256);

    /**
     * @notice Returns the balance of LP tokens for an account
     */
    function balanceOf(address owner) external view returns (uint256);

    /**
     * @notice Returns the allowance for a spender
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @notice Approve a spender to transfer LP tokens
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @notice Transfer LP tokens
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @notice Transfer LP tokens from one address to another
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);

    /**
     * @notice Returns the domain separator for EIP-2612
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32);

    /**
     * @notice Returns the typehash for permit
     */
    function PERMIT_TYPEHASH() external pure returns (bytes32);

    /**
     * @notice Returns the nonce for an address for permit
     */
    function nonces(address owner) external view returns (uint256);

    /**
     * @notice EIP-2612 permit function
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Emitted on mint
     */
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);

    /**
     * @notice Emitted on burn
     */
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);

    /**
     * @notice Emitted on swap
     */
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

    /**
     * @notice Emitted on sync
     */
    event Sync(uint112 reserve0, uint112 reserve1);

    /**
     * @notice Returns the minimum liquidity locked permanently
     */
    function MINIMUM_LIQUIDITY() external pure returns (uint256);

    /**
     * @notice Returns the factory address
     */
    function factory() external view returns (address);

    /**
     * @notice Returns token0 address
     */
    function token0() external view returns (address);

    /**
     * @notice Returns token1 address
     */
    function token1() external view returns (address);

    /**
     * @notice Returns reserves and last update timestamp
     * @return reserve0 Reserve of token0
     * @return reserve1 Reserve of token1
     * @return blockTimestampLast Timestamp of last update
     */
    function getReserves() external view returns (
        uint112 reserve0,
        uint112 reserve1,
        uint32 blockTimestampLast
    );

    /**
     * @notice Returns the cumulative price for token0
     */
    function price0CumulativeLast() external view returns (uint256);

    /**
     * @notice Returns the cumulative price for token1
     */
    function price1CumulativeLast() external view returns (uint256);

    /**
     * @notice Returns the value of k (reserve0 * reserve1) from last liquidity event
     */
    function kLast() external view returns (uint256);

    /**
     * @notice Add liquidity to the pool
     * @param to Address to receive LP tokens
     * @return liquidity Amount of LP tokens minted
     */
    function mint(address to) external returns (uint256 liquidity);

    /**
     * @notice Remove liquidity from the pool
     * @param to Address to receive underlying tokens
     * @return amount0 Amount of token0 returned
     * @return amount1 Amount of token1 returned
     */
    function burn(address to) external returns (uint256 amount0, uint256 amount1);

    /**
     * @notice Swap tokens
     * @param amount0Out Amount of token0 to receive
     * @param amount1Out Amount of token1 to receive
     * @param to Address to receive output tokens
     * @param data Callback data for flash swaps
     */
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;

    /**
     * @notice Force reserves to match balances
     * @param to Address to receive excess tokens
     */
    function skim(address to) external;

    /**
     * @notice Force balances to match reserves
     */
    function sync() external;

    /**
     * @notice Initialize the pair (called once by factory)
     * @param _token0 Address of token0
     * @param _token1 Address of token1
     */
    function initialize(address _token0, address _token1) external;
}
