import { describe, expect, it } from "vitest";
import { matchesOrderSearch, type OrderSearchRecord } from "@/lib/orderSearch";

const order: OrderSearchRecord = {
  order_number: "ML-150000",
  customer_name: "Rahim Uddin",
  phone: "01712345678",
  consignment_id: 987654,
  tracking_code: "stead-abc",
};

describe("matchesOrderSearch", () => {
  it("matches customer name, phone, order number, consignment ID, and tracking code", () => {
    expect(matchesOrderSearch(order, "rahim")).toBe(true);
    expect(matchesOrderSearch(order, "01712")).toBe(true);
    expect(matchesOrderSearch(order, "ML-150000")).toBe(true);
    expect(matchesOrderSearch(order, "987654")).toBe(true);
    expect(matchesOrderSearch(order, "stead-abc")).toBe(true);
  });

  it("matches courier identifiers without case sensitivity or exact formatting", () => {
    expect(matchesOrderSearch(order, " STEAD-ABC ")).toBe(true);
    expect(matchesOrderSearch(order, "15000")).toBe(true);
  });

  it("returns false for a missing value and handles absent courier identifiers", () => {
    expect(matchesOrderSearch(order, "missing")).toBe(false);
    expect(
      matchesOrderSearch({ ...order, consignment_id: null, tracking_code: null }, "987654"),
    ).toBe(false);
  });

  it("matches an order number typed the way it is displayed, with a leading #", () => {
    expect(matchesOrderSearch(order, "#ML-150000")).toBe(true);
    expect(matchesOrderSearch(order, " #ml-150000 ")).toBe(true);
    expect(matchesOrderSearch({ ...order, order_number: "#1042" }, "1042")).toBe(true);
    expect(matchesOrderSearch({ ...order, order_number: "#1042" }, "#1042")).toBe(true);
    expect(matchesOrderSearch(order, "#ML-999999")).toBe(false);
  });

  it("matches every order when the query is empty", () => {
    expect(matchesOrderSearch(order, "")).toBe(true);
    expect(matchesOrderSearch(order, "   ")).toBe(true);
  });

  it("matches a city, thana or area typed anywhere in the address", () => {
    const withAddress = { ...order, address: "House 12, Road 5, Mirpur 10, Dhaka" };
    expect(matchesOrderSearch(withAddress, "mirpur")).toBe(true);
    expect(matchesOrderSearch(withAddress, "Mirpur 10")).toBe(true);
    expect(matchesOrderSearch({ ...order, address: "থানা লৌহজং, জেলা মুন্সিগঞ্জ" }, "লৌহজং")).toBe(true);
    expect(matchesOrderSearch(withAddress, "uttara")).toBe(false);
    expect(matchesOrderSearch({ ...order, address: null }, "mirpur")).toBe(false);
  });

  it("matches a district by any of its spellings, in English or Bangla", () => {
    const banglaDhaka = { ...order, address: "উত্তর বাড্ডা, গুলশান, ঢাকা" };
    const chittagong = { ...order, address: "Agrabad, Chittagong" };
    expect(matchesOrderSearch(banglaDhaka, "dhaka")).toBe(true);
    expect(matchesOrderSearch(chittagong, "চট্টগ্রাম")).toBe(true);
    expect(matchesOrderSearch(chittagong, "Chattogram")).toBe(true);
    expect(matchesOrderSearch(banglaDhaka, "chattogram")).toBe(false);
  });

  it("matches an area typed in English against a Bangla address, and the reverse", () => {
    expect(matchesOrderSearch({ ...order, address: "বাসা ৫, মিরপুর ১০, ঢাকা" }, "Mirpur")).toBe(true);
    expect(matchesOrderSearch({ ...order, address: "বাসা ৫, মিরপুর ১০, ঢাকা" }, "mirpur 10")).toBe(true);
    expect(matchesOrderSearch({ ...order, address: "House 5, Mirpur-10, Dhaka" }, "মিরপুর")).toBe(true);
    expect(matchesOrderSearch({ ...order, address: "সাভার বাজার রোড" }, "Savar")).toBe(true);
    expect(matchesOrderSearch({ ...order, address: "সাভার বাজার রোড" }, "sabhar")).toBe(true);
    expect(matchesOrderSearch({ ...order, address: "Hathazari, Chattogram" }, "হাটহাজারী")).toBe(true);
    expect(matchesOrderSearch({ ...order, address: "চাঁদপুর সদর" }, "Chandpur sadar")).toBe(true);
    expect(matchesOrderSearch({ ...order, address: "বাসা ৫, মিরপুর ১০, ঢাকা" }, "Uttara")).toBe(false);
  });

  it("ignores spaces, dashes and punctuation when matching an address", () => {
    const address = { ...order, address: "House 5, Mirpur 10, Dhaka" };
    expect(matchesOrderSearch(address, "mirpur10")).toBe(true);
    expect(matchesOrderSearch(address, "Mirpur-10")).toBe(true);
    expect(matchesOrderSearch({ ...order, address: "Mirpur-10" }, "mirpur 10")).toBe(true);
    expect(matchesOrderSearch(address, "mirpur 11")).toBe(false);
  });
});
