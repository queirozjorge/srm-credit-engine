package com.backend.common.pricing;

import com.backend.settlement.exceptions.FinancialProcessingException;
import com.backend.settlement.model.PricingSnapshot;
import java.math.BigDecimal;
import java.math.RoundingMode;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PricingEngineTest {
    private final PricingEngine engine=new PricingEngine();
    private PricingSnapshot snapshot(String face,int days,String currency,String spread,String rate) {
        return new PricingSnapshot(new BigDecimal(face),"DUPLICATA_MERCANTIL",currency,days,new BigDecimal("0.01"),
                new BigDecimal(spread),rate==null?null:new BigDecimal(rate),"1","ACTUAL_30","DECIMAL_50","HALF_EVEN");
    }
    @Test void matchesAllGoldenCasesAndRoundsBrlBeforeConverting() {
        assertEquals(new BigDecimal("92859.94"),engine.calculate(snapshot("100000.00",90,"BRL","0.015",null)).paymentValue());
        assertEquals(new BigDecimal("23337.77"),engine.calculate(snapshot("25000.00",60,"BRL","0.025",null)).paymentValue());
        var dollar=engine.calculate(snapshot("100000.00",90,"USD","0.015","5.4321"));
        assertEquals(new BigDecimal("17094.67"),dollar.paymentValue());
        assertEquals(new BigDecimal("7140.06"),dollar.discountBrl());
    }
    @Test void fractionalMonthUsesDecimalPower() {
        var expected=new BigDecimal("1000").divide(new BigDecimal("1.025").sqrt(PricingEngine.PRECISION),PricingEngine.PRECISION).setScale(2,RoundingMode.HALF_EVEN);
        assertEquals(expected,engine.calculate(snapshot("1000.00",15,"BRL","0.015",null)).presentValueBrl());
    }
    @Test void zeroTermAndExactHalfEvenTies() {
        assertEquals(new BigDecimal("1000.00"),engine.calculate(snapshot("1000.00",0,"BRL","0.015",null)).paymentValue());
        for(String face:new String[]{"1.00","3.00"}) {
            var s=new PricingSnapshot(new BigDecimal(face),"CHEQUE_PRE_DATADO","BRL",30,new BigDecimal("0.575"),
                    new BigDecimal("0.025"),null,"1","ACTUAL_30","DECIMAL_50","HALF_EVEN");
            assertEquals(new BigDecimal(face.equals("1.00")?"0.62":"1.88"),engine.calculate(s).presentValueBrl());
        }
    }
    @Test void usesAcceptedSpreadInsteadOfCurrentTypeDefaults() {
        var result=engine.calculate(snapshot("1000.00",30,"BRL","0.09",null));
        assertEquals(new BigDecimal("909.09"),result.presentValueBrl());
    }
    @Test void rejectsConvertedOverflowAndUnsupportedRule() {
        assertEquals("LIMITE_NUMERICO_EXCEDIDO",assertThrows(FinancialProcessingException.class,
                () -> engine.calculate(snapshot("99999999999999999.99",0,"USD","0.015","0.000000000001"))).code());
        var s=new PricingSnapshot(BigDecimal.ONE,"DUPLICATA_MERCANTIL","BRL",0,BigDecimal.ZERO,BigDecimal.ZERO,null,"future","ACTUAL_30","DECIMAL_50","HALF_EVEN");
        assertEquals("REGRA_NAO_SUPORTADA",assertThrows(FinancialProcessingException.class,() -> engine.calculate(s)).code());
    }
}
