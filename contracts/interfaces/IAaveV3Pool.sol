// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAaveV3Pool
 * @notice Interface for Aave V3 Pool contract
 * @dev Complete interface for flash loans and reserve data queries
 */
interface IAaveV3Pool {
    /**
     * @notice Struct for reserve data
     * @dev Matches Aave V3 DataTypes.ReserveData
     */
    struct ReserveData {
        // Stores the reserve configuration
        uint256 configuration;
        // The liquidity index. Expressed in ray
        uint128 liquidityIndex;
        // The current supply rate. Expressed in ray
        uint128 currentLiquidityRate;
        // Variable borrow index. Expressed in ray
        uint128 variableBorrowIndex;
        // The current variable borrow rate. Expressed in ray
        uint128 currentVariableBorrowRate;
        // The current stable borrow rate. Expressed in ray
        uint128 currentStableBorrowRate;
        // Timestamp of last update
        uint40 lastUpdateTimestamp;
        // The id of the reserve
        uint16 id;
        // aToken address
        address aTokenAddress;
        // stableDebtToken address
        address stableDebtTokenAddress;
        // variableDebtToken address
        address variableDebtTokenAddress;
        // Address of the interest rate strategy
        address interestRateStrategyAddress;
        // The current treasury balance, scaled
        uint128 accruedToTreasury;
        // The outstanding unbacked aTokens minted through the bridging feature
        uint128 unbacked;
        // The outstanding debt borrowed against this asset in isolation mode
        uint128 isolationModeTotalDebt;
    }

    /**
     * @notice Allows smartcontracts to access the liquidity of the pool within one transaction,
     * as long as the amount taken plus a fee is returned.
     * @param receiverAddress The address of the contract receiving the funds
     * @param asset The address of the asset being flash-borrowed
     * @param amount The amount of the asset being flash-borrowed
     * @param params Variadic packed params to pass to the receiver as extra information
     * @param referralCode The code used to register the integrator originating the operation
     */
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;

    /**
     * @notice Returns the list of initialized reserves
     * @return The list of addresses of the initialized reserves
     */
    function getReservesList() external view returns (address[] memory);

    /**
     * @notice Returns the configuration of the reserve
     * @param asset The address of the underlying asset of the reserve
     * @return The configuration of the reserve as a ReserveData struct
     */
    function getReserveData(address asset) external view returns (ReserveData memory);

    /**
     * @notice Returns the normalized income of the reserve
     * @param asset The address of the underlying asset of the reserve
     * @return The normalized income, expressed in ray
     */
    function getReserveNormalizedIncome(address asset) external view returns (uint256);

    /**
     * @notice Returns the normalized variable debt of the reserve
     * @param asset The address of the underlying asset of the reserve
     * @return The normalized variable debt, expressed in ray
     */
    function getReserveNormalizedVariableDebt(address asset) external view returns (uint256);

    /**
     * @notice Returns the configuration of the user across all the reserves
     * @param user The user address
     * @return Configuration bitmap
     */
    function getUserConfiguration(address user) external view returns (uint256);

    /**
     * @notice Supplies an amount of underlying asset into the reserve
     * @param asset The address of the underlying asset to supply
     * @param amount The amount to be supplied
     * @param onBehalfOf The address that will receive the aTokens
     * @param referralCode Code used to register the integrator
     */
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /**
     * @notice Withdraws an amount of underlying asset from the reserve
     * @param asset The address of the underlying asset to withdraw
     * @param amount The amount to be withdrawn
     * @param to The address that will receive the underlying
     * @return The final amount withdrawn
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);
}
