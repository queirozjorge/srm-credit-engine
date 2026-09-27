package com.backend.batch.proxy;

public class ParserProblem extends RuntimeException {
  private final int line;

  public ParserProblem(String message, int line) {
    super(message);
    this.line = line;
  }

  public int line() {
    return line;
  }
}
