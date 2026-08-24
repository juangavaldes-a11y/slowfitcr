export default function ShopLoading() {
  return (
    <main className="slowfit-shop-page slowfit-shop-loading" aria-busy="true" role="status">
      <span className="slowfit-loading-spinner" aria-hidden="true" />
      <p>Cargando tienda / Loading shop</p>
    </main>
  );
}