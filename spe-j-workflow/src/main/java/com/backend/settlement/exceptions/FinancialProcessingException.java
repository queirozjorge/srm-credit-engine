package com.backend.settlement.exceptions;

public class FinancialProcessingException extends RuntimeException {
    private final String code;
    public FinancialProcessingException(String code, String message) {
        super(message);
        this.code = code;
    }
    public String code() { return code; }
}
