import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowClockwise, Check, MagnifyingGlass, Package, WarningCircle } from "@phosphor-icons/react";
import {
  catalogImage,
  catalogOptionLabel,
  catalogOptionPrice,
  catalogOptionStock,
  formatTaka,
  matchesCatalogSearch,
  type CatalogProduct,
  type CatalogVariant,
  type OrderEditorItem,
} from "@/lib/orderEditor";

type ProductPickerProps = {
  products: CatalogProduct[];
  search: string;
  loading: boolean;
  error: boolean;
  canEdit: boolean;
  locked: boolean;
  onSearch: (search: string) => void;
  onRetry: () => void;
  onAdd: (product: CatalogProduct, variant?: CatalogVariant) => void;
  /** Lines already in the order, so their weights show as picked. */
  cartItems?: OrderEditorItem[];
};

type PickOption = { key: string; product: CatalogProduct; variant?: CatalogVariant; disabled: boolean };

function optionsOf(product: CatalogProduct, canEdit: boolean): PickOption[] {
  const variants: Array<CatalogVariant | undefined> = product.variants.length > 0 ? product.variants : [undefined];
  return variants.map((variant) => ({
    key: `${product.id}:${variant?.id ?? "product"}`,
    product,
    variant,
    disabled: !canEdit || catalogOptionStock(product, variant) <= 0,
  }));
}

/** Search the catalog and add a product by tapping the weight to sell. */
export function ProductPicker({ products, search, loading, error, canEdit, locked, onSearch, onRetry, onAdd, cartItems = [] }: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // The keyboard cursor appears only once the user types or uses the arrows,
  // so a freshly opened list never looks like something is already chosen.
  const [keyboardActive, setKeyboardActive] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const filtered = useMemo(() => products.filter((product) => matchesCatalogSearch(product, search)), [products, search]);
  const enabled = useMemo(() => filtered.flatMap((product) => optionsOf(product, canEdit)).filter((option) => !option.disabled), [filtered, canEdit]);
  const highlightedKey = keyboardActive ? enabled[Math.min(highlight, enabled.length - 1)]?.key : undefined;
  const inOrder = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const item of cartItems) {
      const key = `${item.product_id}:${item.variant_id ?? "product"}`;
      quantities.set(key, (quantities.get(key) ?? 0) + item.quantity);
    }
    return quantities;
  }, [cartItems]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (enabled.length === 0) return;
      if (!keyboardActive) {
        setKeyboardActive(true);
        setHighlight(event.key === "ArrowDown" ? 0 : enabled.length - 1);
        return;
      }
      setHighlight((current) => (Math.min(current, enabled.length - 1) + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length);
    } else if (event.key === "Enter") {
      const option = enabled.find((candidate) => candidate.key === highlightedKey);
      if (!open || !option) return;
      event.preventDefault();
      onAdd(option.product, option.variant);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <section aria-label="Product catalog" ref={rootRef} className="relative">
      <label className="relative block">
        <span className="sr-only">Search products</span>
        <MagnifyingGlass weight="light" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/55" />
        <input
          type="search"
          aria-label="Search products"
          aria-expanded={open}
          aria-controls="product-picker-results"
          value={search}
          disabled={locked}
          onFocus={() => { setOpen(true); setKeyboardActive(false); }}
          onMouseDown={(event) => {
            // A click on the already-focused field toggles the list; the first click opens it through focus.
            if (document.activeElement === event.currentTarget) setOpen((current) => !current);
          }}
          onChange={(event) => { onSearch(event.target.value); setHighlight(0); setKeyboardActive(event.target.value.trim() !== ""); setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Add a product: type a name, then pick the weight"
          className="h-12 w-full rounded-xl bg-white pl-11 pr-24 text-[14px] text-black shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none ring-1 ring-inset ring-black/[0.08] transition placeholder:text-black/40 focus:ring-black/25 disabled:bg-black/[0.03] disabled:opacity-60"
        />
        <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[10.5px] text-black/35 sm:flex">
          <kbd className="rounded border border-black/10 bg-white px-1 font-mono">↑↓</kbd>
          <kbd className="rounded border border-black/10 bg-white px-1 font-mono">↵</kbd>
        </span>
      </label>

      {error && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">
          <WarningCircle weight="light" size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">Could not load the product catalog.</span>
          <button type="button" onClick={onRetry} className="inline-flex h-7 items-center gap-1 rounded-md bg-black px-2.5 text-[11.5px] text-white"><ArrowClockwise weight="light" size={13} /> Retry</button>
        </div>
      )}

      <AnimatePresence>
        {open && !locked && !error && (
          <motion.div
            id="product-picker-results"
            data-testid="catalog-scroll-region"
            initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: "top center" }}
            onPointerMove={() => { if (keyboardActive) setKeyboardActive(false); }}
            className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[min(420px,55vh)] overflow-y-auto rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_16px_40px_rgba(0,0,0,0.12)]"
          >
            {loading ? (
              <p className="py-8 text-center text-[13px] text-black/55">Loading catalog…</p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-black/55">No products match your search.</p>
            ) : filtered.map((product) => {
              const image = catalogImage(product);
              return (
                <div key={product.id} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-lg px-2 py-2.5 [&+&]:border-t [&+&]:border-black/[0.05]">
                  <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-black/[0.04]">
                    {image ? <img src={image} alt={product.name} className="h-full w-full object-cover" /> : <Package weight="light" size={18} className="text-black/25" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-black">{product.name}{product.slug && <span className="ml-2 font-mono text-[10.5px] font-normal text-black/40">{product.slug}</span>}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {optionsOf(product, canEdit).map((option) => {
                        const label = catalogOptionLabel(product, option.variant);
                        const stock = catalogOptionStock(product, option.variant);
                        const named = product.variants.length > 0 ? `Add ${product.name}, ${label} to cart` : `Add ${product.name} to cart`;
                        const picked = inOrder.get(option.key) ?? 0;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            aria-label={named}
                            disabled={option.disabled}
                            data-highlighted={option.key === highlightedKey || undefined}
                            data-picked={picked > 0 || undefined}
                            onClick={() => onAdd(product, option.variant)}
                            title={picked > 0 ? `${picked} in this order. Click to add one more.` : stock <= 0 ? "Out of stock" : `${stock} in stock`}
                            className={`relative flex flex-col items-start rounded-[9px] px-2.5 py-1.5 text-left ring-inset transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${picked > 0 ? "bg-black text-white ring-1 ring-black data-[highlighted]:shadow-[0_0_0_3px_rgba(0,0,0,0.15)]" : "bg-white text-black ring-1 ring-black/[0.08] hover:ring-black/30 data-[highlighted]:bg-black/[0.04] data-[highlighted]:ring-black/35"}`}
                          >
                            <span className="flex items-center gap-1 text-[12.5px] font-semibold">
                              {picked > 0 && <Check weight="bold" size={11} aria-hidden="true" />}
                              {label}
                              {picked > 0 && <span className="ml-0.5 rounded-full bg-white/20 px-1.5 font-mono text-[10px] font-medium tabular-nums">×{picked}</span>}
                            </span>
                            <span className={`font-mono text-[11px] tabular-nums ${picked > 0 ? "text-white/70" : "text-black/55"}`}>{formatTaka(catalogOptionPrice(product, option.variant))}{stock <= 0 ? " · out" : stock <= 5 ? ` · ${stock} left` : ""}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
