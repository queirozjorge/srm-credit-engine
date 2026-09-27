package com.backend.dashboard.resource;

import com.backend.dashboard.service.IDashboardService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/dashboard")
public class DashboardResource {
  private final IDashboardService service;

  public DashboardResource(IDashboardService service) {
    this.service = service;
  }

  @GetMapping
  public Object get(@RequestParam(defaultValue = "LAST_7_DAYS") String period) {
    return service.get(period);
  }
}
