package com.backend.pricing.resource;

import com.backend.pricing.dto.SimulationInput;
import com.backend.pricing.service.ISimulationService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/simulations")
public class SimulationResource {
  private final ISimulationService service;

  public SimulationResource(ISimulationService service) {
    this.service = service;
  }

  @PostMapping
  public Object simulate(@RequestBody SimulationInput input) {
    return service.simulate(input);
  }
}
