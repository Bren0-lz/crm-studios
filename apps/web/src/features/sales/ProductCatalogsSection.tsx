import { CatalogSection } from "../settings/index";

/** Categorias e marcas usadas no cadastro de produtos do estoque. */
export function ProductCatalogsSection() {
  return (
    <section className="panel" aria-label="Categorias e marcas">
      <div className="panel-head">
        <div>
          <h2>Categorias e marcas</h2>
          <p className="panel-help">
            Listas usadas ao cadastrar e editar produtos na aba Estoque.
          </p>
        </div>
      </div>
      <div className="catalog-groups product-catalogs">
        <CatalogSection kind="product_category" />
        <CatalogSection kind="product_brand" />
      </div>
    </section>
  );
}
