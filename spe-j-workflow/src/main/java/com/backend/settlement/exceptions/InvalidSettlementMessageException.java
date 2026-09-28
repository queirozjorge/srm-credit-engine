package com.backend.settlement.exceptions;

public class InvalidSettlementMessageException extends RuntimeException {
    public InvalidSettlementMessageException(String message, Throwable cause) {
        super(message, cause);
    }
}
