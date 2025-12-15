import Decimal from "decimal.js";

// Set global configuration for the library
// precision: 30 allows for massive numbers (crypto needs ~18-20)
// ROUND_DOWN is standard for financial applications (never round in user's favor)
Decimal.set({ precision: 30, rounding: Decimal.ROUND_DOWN });

// Define a type alias for cleaner code
export type NumberOrString = number | string;

/**
 * Add two numbers with precision
 * @returns string to preserve exact precision
 */
export function add(a: NumberOrString, b: NumberOrString): string {
    return new Decimal(a).plus(b).toString();
}

/**
 * Subtract b from a with precision
 * @returns string to preserve exact precision
 */
export function subtract(a: NumberOrString, b: NumberOrString): string {
    return new Decimal(a).minus(b).toString();
}

/**
 * Multiply two numbers with precision
 * @returns string to preserve exact precision
 */
export function multiply(a: NumberOrString, b: NumberOrString): string {
    return new Decimal(a).times(b).toString();
}

/**
 * Divide a by b with precision
 * @returns string to preserve exact precision
 */
export function divide(a: NumberOrString, b: NumberOrString): string {
    if (new Decimal(b).isZero()) {
        throw new Error("Division by zero");
    }
    return new Decimal(a).div(b).toString();
}

/**
 * Get minimum of two numbers
 * @returns string to preserve exact precision
 */
export function min(a: NumberOrString, b: NumberOrString): string {
    return Decimal.min(new Decimal(a), new Decimal(b)).toString();
}

/**
 * Get maximum of two numbers
 * @returns string to preserve exact precision
 */
export function max(a: NumberOrString, b: NumberOrString): string {
    return Decimal.max(new Decimal(a), new Decimal(b)).toString();
}

/**
 * Check if a < b
 */
export function isLess(a: NumberOrString, b: NumberOrString): boolean {
    return new Decimal(a).lessThan(b);
}

/**
 * Check if a > b
 */
export function isGreater(a: NumberOrString, b: NumberOrString): boolean {
    return new Decimal(a).greaterThan(b);
}

/**
 * Check if a >= b
 */
export function isGreaterOrEqual(a: NumberOrString, b: NumberOrString): boolean {
    return new Decimal(a).greaterThanOrEqualTo(b);
}

/**
 * Check if a <= b
 */
export function isLessOrEqual(a: NumberOrString, b: NumberOrString): boolean {
    return new Decimal(a).lessThanOrEqualTo(b);
}

/**
 * Check if a == b
 */
export function isEqual(a: NumberOrString, b: NumberOrString): boolean {
    return new Decimal(a).equals(b);
}

/**
 * Check if value is zero
 */
export function isZero(a: NumberOrString): boolean {
    return new Decimal(a).isZero();
}

/**
 * Check if value is positive (> 0)
 */
export function isPositive(a: NumberOrString): boolean {
    return new Decimal(a).isPositive() && !new Decimal(a).isZero();
}

/**
 * Check if value is negative (< 0)
 */
export function isNegative(a: NumberOrString): boolean {
    return new Decimal(a).isNegative();
}

/**
 * Format to fixed decimal places (for display)
 * @returns string with exact decimal places
 */
export function toFixed(value: NumberOrString, decimals: number = 8): string {
    return new Decimal(value).toFixed(decimals);
}

/**
 * Convert to number (USE WITH CAUTION - only for display/logging)
 * This loses precision for very large/small numbers!
 */
export function toNumber(value: NumberOrString): number {
    return new Decimal(value).toNumber();
}

/**
 * Create a new Decimal instance (for complex operations)
 */
export function decimal(value: NumberOrString): Decimal {
    return new Decimal(value);
}
