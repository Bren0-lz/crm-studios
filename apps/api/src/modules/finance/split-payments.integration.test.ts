import { MemoryClinicRepository } from "../../memory-repository.js";
import { splitPaymentSuite } from "../../test-support/split-payment-suite.js";

splitPaymentSuite("memory", () => new MemoryClinicRepository());
