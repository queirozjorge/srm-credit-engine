package com.backend.common.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.UUID;

public final class Rows {
  private Rows() {}

  public static Instant instant(ResultSet rs, String name) throws SQLException {
    var v = rs.getTimestamp(name);
    return v == null ? null : v.toInstant();
  }

  public static UUID uuid(ResultSet rs, String name) throws SQLException {
    return rs.getObject(name, UUID.class);
  }

  public static String money(ResultSet rs, String name) throws SQLException {
    return rs.getBigDecimal(name).setScale(2).toPlainString();
  }
}
