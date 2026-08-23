# PDF catalog import

The extractor converts the five Mige Sports PDFs in `reference/` into hidden draft products. It deduplicates repeated sheets, preserves supplier composition and sizing, selects a product image from each page, and creates zero-inventory variants.

```bash
python -m pip install --user -r tools/catalog-import/requirements.txt
python tools/catalog-import/extract_catalog.py
npm --prefix backend run catalog:import -- --dry-run
npm --prefix backend run catalog:import
```

The import is idempotent for products tagged `pdf-import` and refuses to overwrite other products. Imported products always use these defaults:

- `status: DRAFT`
- `published: false`
- `preorderEnabled: false`
- `inventoryQuantity: 0`

Prices are the supplier sample prices shown in the PDFs, not approved retail prices. Records tagged `price-review` or `size-review` need manual completion before publication. Every imported product should be reviewed for title, description, price, color, fit, and imagery before its publication flag is enabled.

## Gender tags for existing catalogs

The source documents assign `men` to the men's catalog, `women` to the three women's catalogs, and both tags to the unisex catalog. To classify an existing database without resetting reviewed product data, run:

```bash
npm --prefix backend run catalog:tag-gender
npm --prefix backend run catalog:tag-gender -- --apply
```

The first command is a dry run. The apply command updates only the `tags` field and preserves publication status, preorder settings, variants, prices, inventory, and images. Set `DATABASE_URL` to the intended environment before running either command.