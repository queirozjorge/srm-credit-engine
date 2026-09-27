package com.backend.batch.proxy;

public interface ImportParser {
  String format();

  ParsedImport parse(String content);
}
