// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IUniswapV3Pool
 * @notice Interface for Uniswap V3 Pool contract
 * @dev Complete interface for V3 pool interactions
 * DO NOT use quoter - all calculations must be done from pool state directly
 */
interface IUniswapV3Pool {
    /**
     * @notice The first of the two tokens of the pool, sorted by address
     */
    function token0() external view returns (address);

    /**
     * @notice The second of the two tokens of the pool, sorted by address
     */
    function token1() external view returns (address);

    /**
     * @notice The pool's fee in hundredths of a bip (i.e., 1e-6)
     * @return The fee
     */
    function fee() external view returns (uint24);

    /**
     * @notice The pool tick spacing
     * @dev Ticks can only be used at multiples of this value
     * @return The tick spacing
     */
    function tickSpacing() external view returns (int24);

    /**
     * @notice The maximum amount of position liquidity that can use any tick in the range
     * @return The max liquidity per tick
     */
    function maxLiquidityPerTick() external view returns (uint128);

    /**
     * @notice The 0th storage slot in the pool stores many values
     * @return sqrtPriceX96 The current price of the pool as a sqrt(token1/token0) Q64.96 value
     * @return tick The current tick of the pool
     * @return observationIndex The index of the last oracle observation
     * @return observationCardinality The current maximum number of observations stored
     * @return observationCardinalityNext The next maximum number of observations to store
     * @return feeProtocol The protocol fee for both tokens of the pool
     * @return unlocked Whether the pool is currently locked to reentrancy
     */
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );

    /**
     * @notice The fee growth as a Q128.128 fees of token0 collected per unit of liquidity for the entire life of the pool
     */
    function feeGrowthGlobal0X128() external view returns (uint256);

    /**
     * @notice The fee growth as a Q128.128 fees of token1 collected per unit of liquidity for the entire life of the pool
     */
    function feeGrowthGlobal1X128() external view returns (uint256);

    /**
     * @notice The amounts of token0 and token1 that are owed to the protocol
     */
    function protocolFees() external view returns (uint128 token0, uint128 token1);

    /**
     * @notice The currently in range liquidity available to the pool
     */
    function liquidity() external view returns (uint128);

    /**
     * @notice Look up information about a specific tick in the pool
     * @param tick The tick to look up
     * @return liquidityGross Total liquidity that uses the tick
     * @return liquidityNet How much liquidity changes when tick is crossed
     * @return feeGrowthOutside0X128 Fee growth per unit of liquidity on the _other_ side of this tick (token0)
     * @return feeGrowthOutside1X128 Fee growth per unit of liquidity on the _other_ side of this tick (token1)
     * @return tickCumulativeOutside Cumulative tick value on the other side of the tick
     * @return secondsPerLiquidityOutsideX128 Seconds per unit of liquidity on the _other_ side of this tick
     * @return secondsOutside Seconds spent on the other side of the tick
     * @return initialized Whether the tick is initialized
     */
    function ticks(int24 tick)
        external
        view
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128,
            int56 tickCumulativeOutside,
            uint160 secondsPerLiquidityOutsideX128,
            uint32 secondsOutside,
            bool initialized
        );

    /**
     * @notice Returns 256 packed tick initialized boolean values
     * @param wordPosition The word position in the mapping
     */
    function tickBitmap(int16 wordPosition) external view returns (uint256);

    /**
     * @notice Returns the information about a position by the position's key
     * @param key The position's key (keccak256 of owner, tickLower, tickUpper)
     * @return liquidity The liquidity of the position
     * @return feeGrowthInside0LastX128 Fee growth of token0 inside the tick range as of the last mint/burn
     * @return feeGrowthInside1LastX128 Fee growth of token1 inside the tick range as of the last mint/burn
     * @return tokensOwed0 Tokens owed to position owner in token0
     * @return tokensOwed1 Tokens owed to position owner in token1
     */
    function positions(bytes32 key)
        external
        view
        returns (
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );

    /**
     * @notice Returns data about a specific observation index
     * @param index The observation index
     * @return blockTimestamp The timestamp of the observation
     * @return tickCumulative The tick accumulator
     * @return secondsPerLiquidityCumulativeX128 The seconds per liquidity accumulator
     * @return initialized Whether the observation has been initialized
     */
    function observations(uint256 index)
        external
        view
        returns (
            uint32 blockTimestamp,
            int56 tickCumulative,
            uint160 secondsPerLiquidityCumulativeX128,
            bool initialized
        );

    /**
     * @notice Swap token0 for token1, or token1 for token0
     * @param recipient The address to receive the output
     * @param zeroForOne The direction of the swap (true = token0 to token1)
     * @param amountSpecified The amount to swap (positive = exact input, negative = exact output)
     * @param sqrtPriceLimitX96 The price limit (sqrtPriceX96)
     * @param data Callback data
     * @return amount0 The delta of token0
     * @return amount1 The delta of token1
     */
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);

    /**
     * @notice Receive token0 and/or token1 and pay it back plus a fee
     * @param recipient The address which will receive the tokens
     * @param amount0 The amount of token0 to flash loan
     * @param amount1 The amount of token1 to flash loan
     * @param data Callback data
     */
    function flash(
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;

    /**
     * @notice Increase the maximum number of price observations
     * @param observationCardinalityNext The desired minimum number of observations
     */
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;

    /**
     * @notice Sets the initial price for the pool
     * @param sqrtPriceX96 The initial sqrt price
     */
    function initialize(uint160 sqrtPriceX96) external;

    /**
     * @notice Adds liquidity for the given recipient/tickLower/tickUpper position
     * @param recipient The address for which liquidity is added
     * @param tickLower The lower tick of the position
     * @param tickUpper The upper tick of the position
     * @param amount The amount of liquidity to add
     * @param data Callback data
     * @return amount0 The amount of token0 added
     * @return amount1 The amount of token1 added
     */
    function mint(
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount,
        bytes calldata data
    ) external returns (uint256 amount0, uint256 amount1);

    /**
     * @notice Collects tokens owed to a position
     * @param recipient The address to receive the tokens
     * @param tickLower The lower tick of the position
     * @param tickUpper The upper tick of the position
     * @param amount0Requested The amount of token0 to collect
     * @param amount1Requested The amount of token1 to collect
     * @return amount0 The amount of token0 collected
     * @return amount1 The amount of token1 collected
     */
    function collect(
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) external returns (uint128 amount0, uint128 amount1);

    /**
     * @notice Burn liquidity from the caller's position
     * @param tickLower The lower tick of the position
     * @param tickUpper The upper tick of the position
     * @param amount The amount of liquidity to burn
     * @return amount0 The amount of token0 removed
     * @return amount1 The amount of token1 removed
     */
    function burn(
        int24 tickLower,
        int24 tickUpper,
        uint128 amount
    ) external returns (uint256 amount0, uint256 amount1);

    /**
     * @notice Emitted when a position's liquidity is removed
     */
    event Burn(
        address indexed owner,
        int24 indexed tickLower,
        int24 indexed tickUpper,
        uint128 amount,
        uint256 amount0,
        uint256 amount1
    );

    /**
     * @notice Emitted when liquidity is minted
     */
    event Mint(
        address sender,
        address indexed owner,
        int24 indexed tickLower,
        int24 indexed tickUpper,
        uint128 amount,
        uint256 amount0,
        uint256 amount1
    );

    /**
     * @notice Emitted by the pool for swaps
     */
    event Swap(
        address indexed sender,
        address indexed recipient,
        int256 amount0,
        int256 amount1,
        uint160 sqrtPriceX96,
        uint128 liquidity,
        int24 tick
    );

    /**
     * @notice Emitted for flash loans
     */
    event Flash(
        address indexed sender,
        address indexed recipient,
        uint256 amount0,
        uint256 amount1,
        uint256 paid0,
        uint256 paid1
    );
}
