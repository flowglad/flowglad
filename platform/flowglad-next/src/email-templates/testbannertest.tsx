import React from "react";
import fs from "fs";
import path from "path";
import { render } from "@react-email/render";
import { OrderReceiptEmail } from "./customer-order-receipt";

// Temporary CurrencyCode enum for testing
enum CurrencyCode {
  USD = "usd",
  EUR = "eur",
  GBP = "gbp",
  // Add any other currencies you might use
}

const mockProps = {
  invoiceNumber: "INV-TEST-001",
  orderDate: new Date().toLocaleDateString(),
  invoice: {
    subtotal: 10000,
    taxAmount: 800,
    currency: CurrencyCode.USD, // ✅ fixed
  },
  organizationLogoUrl: "https://placehold.co/100x40",
  organizationName: "Flowglad Test Org",
  organizationId: "org_test_123",
  customerId: "cus_test_123",
  lineItems: [
    { name: "Widget A", price: 5000, quantity: 1 },
    { name: "Widget B", price: 2500, quantity: 2 },
  ],
  discountInfo: {
    discountName: "Test Discount",
    discountCode: "TEST10",
    discountAmount: 1000,
    discountAmountType: "flat",
  },
};

async function main() {
  const html = await render(<OrderReceiptEmail {...mockProps} />);

  const outputPath = path.join(process.cwd(), "order-receipt-test.html");
  fs.writeFileSync(outputPath, html);
  console.log(`✅ Rendered email written to: ${outputPath}`);
}

main().catch(console.error);
