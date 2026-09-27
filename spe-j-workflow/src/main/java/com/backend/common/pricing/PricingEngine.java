package com.backend.common.pricing;

import com.backend.settlement.exceptions.FinancialProcessingException;
import com.backend.settlement.model.FinancialResult;
import com.backend.settlement.model.PricingSnapshot;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Calculates exclusively from accepted conditions, independent of the engine application. */
@Component
public class PricingEngine {
    public static final MathContext PRECISION = new MathContext(50, RoundingMode.HALF_EVEN);
    public static final String RULE_VERSION = "1";
    private static final BigDecimal MONEY_LIMIT = new BigDecimal("99999999999999999.99");
    private static final BigDecimal RATE_LIMIT = new BigDecimal("999999999999.999999999999");

    public FinancialResult calculate(PricingSnapshot snapshot) {
        if (!RULE_VERSION.equals(snapshot.ruleVersion()) || !"ACTUAL_30".equals(snapshot.termConvention())
                || !"DECIMAL_50".equals(snapshot.calculationPolicy()) || !"HALF_EVEN".equals(snapshot.roundingPolicy()))
            throw failure("REGRA_NAO_SUPORTADA", "A versão ou política de cálculo não é suportada.");
        if (snapshot.receivableType() == null || !Set.of("DUPLICATA_MERCANTIL", "CHEQUE_PRE_DATADO").contains(snapshot.receivableType())
                || snapshot.paymentCurrency() == null || !Set.of("BRL", "USD").contains(snapshot.paymentCurrency())
                || snapshot.termDays() < 0 || snapshot.faceValue() == null || snapshot.faceValue().signum() <= 0
                || snapshot.faceValue().scale() > 2)
            throw failure("DADOS_INVALIDOS", "As condições financeiras do título são inválidas.");
        checkMoney(snapshot.faceValue());
        checkRate(snapshot.baseRate());
        checkRate(snapshot.spread());
        var base = BigDecimal.ONE.add(snapshot.baseRate(), PRECISION).add(snapshot.spread(), PRECISION);
        if (base.signum() <= 0) throw failure("DADOS_INVALIDOS", "A base do cálculo deve ser positiva.");
        var term = BigDecimal.valueOf(snapshot.termDays()).divide(new BigDecimal("30"), PRECISION);
        var exponent = DecimalPower.log(base).multiply(term, PRECISION).negate();
        if (exponent.compareTo(new BigDecimal("1000")) > 0) throw overflow();
        BigDecimal present;
        if (exponent.compareTo(new BigDecimal("-1000")) < 0) present = BigDecimal.ZERO;
        else if (snapshot.termDays() % 30 == 0)
            present = snapshot.faceValue().divide(base.pow(snapshot.termDays() / 30, PRECISION), PRECISION);
        else present = snapshot.faceValue().multiply(DecimalPower.exp(exponent), PRECISION);
        present = present.setScale(2, RoundingMode.HALF_EVEN);
        checkMoney(present);
        var payment = present;
        if ("USD".equals(snapshot.paymentCurrency())) {
            checkRate(snapshot.exchangeRate());
            if (snapshot.exchangeRate().signum() <= 0) throw failure("COTACAO_INVALIDA", "A cotação fixada deve ser positiva.");
            payment = present.divide(snapshot.exchangeRate(), 2, RoundingMode.HALF_EVEN);
        }
        checkMoney(payment);
        var discount = snapshot.faceValue().subtract(present).setScale(2, RoundingMode.HALF_EVEN);
        checkMoney(discount);
        return new FinancialResult(present, discount, payment);
    }

    private static void checkRate(BigDecimal rate) {
        if (rate == null || rate.scale() > 12 || rate.abs().compareTo(RATE_LIMIT) > 0)
            throw failure("TAXA_INVALIDA", "A taxa fixada é inválida ou excede o limite permitido.");
    }
    private static void checkMoney(BigDecimal value) {
        if (value.abs().compareTo(MONEY_LIMIT) > 0) throw overflow();
    }
    private static FinancialProcessingException overflow() {
        return failure("LIMITE_NUMERICO_EXCEDIDO", "O valor excede o limite financeiro permitido.");
    }
    private static FinancialProcessingException failure(String code, String message) {
        return new FinancialProcessingException(code, message);
    }
}
