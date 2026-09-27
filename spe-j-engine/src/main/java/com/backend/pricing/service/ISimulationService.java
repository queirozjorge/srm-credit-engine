package com.backend.pricing.service;

import com.backend.pricing.dto.SimulationInput;

public interface ISimulationService {
  Object simulate(SimulationInput input);
}
