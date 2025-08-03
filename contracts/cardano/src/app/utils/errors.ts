import { IUTxO, Value } from "@harmoniclabs/plu-ts";

/**
 * Custom error classes for better error handling
 */
export class SwapError extends Error {
    constructor(message: string, public code: string, public details?: any) {
        super(message);
        this.name = 'SwapError';
    }
}

export class ValidationError extends SwapError {
    constructor(message: string, details?: any) {
        super(message, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
    }
}

export class InsufficientFundsError extends SwapError {
    constructor(message: string, required: bigint, available: bigint) {
        super(message, 'INSUFFICIENT_FUNDS', { required, available });
        this.name = 'InsufficientFundsError';
    }
}

export class TimelockError extends SwapError {
    constructor(message: string, currentTime: number, deadline: number) {
        super(message, 'TIMELOCK_ERROR', { currentTime, deadline });
        this.name = 'TimelockError';
    }
}

export class NetworkError extends SwapError {
    constructor(message: string, details?: any) {
        super(message, 'NETWORK_ERROR', details);
        this.name = 'NetworkError';
    }
}
