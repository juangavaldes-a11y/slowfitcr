"use client";

import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import AdminShell from "./admin-shell";
import { apiRequest, formatApiError, isApiErrorStatus } from "./lib/api-client";
import { getProductColor, productColors } from "./lib/product-colors";

type CatalogImage = { id?: string; url: string; altText: string; position?: number };
type CatalogVariant = {
  id?: string;
  title: string;
  size?: string | null;
  color?: string | null;
  colorHex?: string | null;
  sku?: string | null;
  price: number;
  compareAtPrice?: number | null;
  inventoryQuantity: number;
  position?: number;
};
type CatalogProduct = {
  id: string;
  title: string;
  handle: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  published: boolean;
  preorderEnabled: boolean;
  tags: string[];
  minPrice: number;
  inventoryTotal: number;
  metric: { searchImpressions: number; clicks: number; unitsSold: number; revenue: number };
  images: CatalogImage[];
  variants: CatalogVariant[];
  updatedAt: string;
};
type ProductForm = Omit<CatalogProduct, "id" | "updatedAt">;

export default function CatalogAdminPanel({ locale }: { locale: "es" | "en" }) {
  const [api, contextHolder] = message.useMessage();
  const [form] = Form.useForm<ProductForm>();
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const labels = useMemo(() => locale === "es" ? {
    title: "Catalogo e inventario",
    subtitle: "Administra productos, imagenes, variantes, existencias, etiquetas, precios y ofertas.",
    search: "Buscar producto",
    allStatuses: "Todos los estados",
    allTags: "Todas las etiquetas",
    create: "Nuevo producto",
    edit: "Editar",
    remove: "Eliminar",
    removeConfirm: "¿Eliminar este producto definitivamente?",
    empty: "No hay productos para estos filtros.",
    product: "Producto",
    status: "Estado",
    published: "Visible en tienda (requiere estado Activo)",
    preorder: "Permitir preventa sin inventario (requiere Activo y Visible)",
    stock: "Inventario",
    price: "Precio",
    searches: "Busquedas",
    clicks: "Clics",
    sold: "Vendidos",
    revenue: "Ingresos",
    actions: "Acciones",
    draft: "Borrador",
    active: "Activo",
    archived: "Archivado",
    draftHelp: "Borrador: no aparece en la tienda hasta cambiarlo a Activo y hacerlo visible.",
    activeHelp: "Activo: producto publicado y visible en la tienda.",
    preorderHelp: "Preventa: producto activo y visible que puede venderse aunque no tenga inventario.",
    archivedHelp: "Archivado: producto retirado de la tienda.",
    details: "Datos del producto",
    name: "Nombre",
    handle: "Identificador URL",
    description: "Descripcion",
    tags: "Etiquetas",
    tagsHint: "Escribe una etiqueta y presiona Enter",
    images: "Imagenes",
    imageUrl: "URL de imagen",
    imageAlt: "Texto alternativo",
    upload: "Subir a R2",
    variants: "Variantes",
    variant: "Variante",
    size: "Talla",
    color: "Color",
    sku: "SKU",
    compareAt: "Precio anterior",
    quantity: "Cantidad",
    addVariant: "Agregar variante",
    addImage: "Agregar URL",
    save: "Guardar producto",
    cancel: "Cancelar",
    saved: "Producto guardado.",
    deleted: "Producto eliminado.",
    loadFail: "No pudimos cargar el catalogo.",
    saveFail: "No pudimos guardar el producto.",
    uploadFail: "No pudimos subir la imagen.",
    maxImage: "La imagen debe pesar menos de 8 MB.",
    required: "Este campo es obligatorio.",
    total: (count: number) => `${count} productos`,
  } : {
    title: "Catalog and inventory",
    subtitle: "Manage products, images, variants, stock, tags, prices, and sales.",
    search: "Search products",
    allStatuses: "All statuses",
    allTags: "All tags",
    create: "New product",
    edit: "Edit",
    remove: "Delete",
    removeConfirm: "Permanently delete this product?",
    empty: "No products match these filters.",
    product: "Product",
    status: "Status",
    published: "Visible in shop (requires Active status)",
    preorder: "Allow preorder without inventory (requires Active and Visible)",
    stock: "Inventory",
    price: "Price",
    searches: "Searches",
    clicks: "Clicks",
    sold: "Sold",
    revenue: "Revenue",
    actions: "Actions",
    draft: "Draft",
    active: "Active",
    archived: "Archived",
    draftHelp: "Draft: hidden from the shop until it is Active and visible.",
    activeHelp: "Active: published and visible in the shop.",
    preorderHelp: "Pre-order: active and visible, and can be sold without inventory.",
    archivedHelp: "Archived: removed from the shop.",
    details: "Product details",
    name: "Name",
    handle: "URL handle",
    description: "Description",
    tags: "Tags",
    tagsHint: "Type a tag and press Enter",
    images: "Images",
    imageUrl: "Image URL",
    imageAlt: "Alternative text",
    upload: "Upload to R2",
    variants: "Variants",
    variant: "Variant",
    size: "Size",
    color: "Color",
    sku: "SKU",
    compareAt: "Previous price",
    quantity: "Quantity",
    addVariant: "Add variant",
    addImage: "Add URL",
    save: "Save product",
    cancel: "Cancel",
    saved: "Product saved.",
    deleted: "Product deleted.",
    loadFail: "We could not load the catalog.",
    saveFail: "We could not save the product.",
    uploadFail: "We could not upload the image.",
    maxImage: "Images must be smaller than 8 MB.",
    required: "This field is required.",
    total: (count: number) => `${count} products`,
  }, [locale]);

  const loadProducts = async (
    requestedPage = page,
    requestedStatus = status,
    requestedTags = selectedTags,
    requestedSortBy = sortBy,
    requestedSortOrder = sortOrder,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(requestedPage), pageSize: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (requestedStatus !== "all") params.set("status", requestedStatus);
      requestedTags.forEach((tag) => params.append("tag", tag));
      params.set("sortBy", requestedSortBy);
      params.set("sortOrder", requestedSortOrder);
      const payload = await apiRequest<{ products: CatalogProduct[]; total: number; page: number; tags: string[] }>(`/api/admin/catalog/products?${params}`);
      setProducts(payload.products);
      setPage(payload.page);
      setTotal(payload.total);
      setAvailableTags(payload.tags);
      setAuthorized(true);
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setAuthorized(false);
        setProducts([]);
        setTotal(0);
        setAvailableTags([]);
      } else {
        api.error(formatApiError(error, locale, { fallback: labels.loadFail }));
      }
    } finally {
      setLoading(false);
      setSessionReady(true);
    }
  };

  const loadInitialProducts = useEffectEvent(() => loadProducts());
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInitialProducts(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const onLogin = async ({ token }: { token: string }) => {
    setLoginLoading(true);
    try {
      await apiRequest("/api/admin/login", { method: "POST", body: JSON.stringify({ token }) });
      await loadProducts();
    } catch (error) {
      api.error(formatApiError(error, locale, { preserveClientMessage: false }));
    } finally {
      setLoginLoading(false);
      setSessionReady(true);
    }
  };

  const onLogout = async () => {
    await apiRequest("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    setAuthorized(false);
    setProducts([]);
    setTotal(0);
  };

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      title: "",
      handle: "",
      description: "",
      status: "DRAFT",
      published: false,
      preorderEnabled: false,
      tags: [],
      images: [],
      variants: [{ title: "Default", size: "One Size", color: null, colorHex: null, sku: "", price: 0, compareAtPrice: null, inventoryQuantity: 0 }],
    });
    setModalOpen(true);
  };

  const openEdit = (product: CatalogProduct) => {
    setEditing(product);
    form.setFieldsValue({
      title: product.title,
      handle: product.handle,
      description: product.description,
      status: product.status,
      published: product.published,
      preorderEnabled: product.preorderEnabled,
      tags: product.tags,
      images: product.images.map(({ id, url, altText }) => ({ id, url, altText })),
      variants: product.variants.map(({ id, title, size, color, colorHex, sku, price, compareAtPrice, inventoryQuantity }) => ({
        id, title, size: size || title, color, colorHex, sku, price, compareAtPrice, inventoryQuantity,
      })),
    });
    setModalOpen(true);
  };

  const saveProduct = async (values: ProductForm) => {
    setSaving(true);
    try {
      await apiRequest(editing ? `/api/admin/catalog/products/${editing.id}` : "/api/admin/catalog/products", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(values),
      });
      api.success(labels.saved);
      setModalOpen(false);
      await loadProducts();
    } catch (error) {
      api.error(formatApiError(error, locale, { fallback: labels.saveFail, preserveClientMessage: true }));
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (productId: string) => {
    try {
      await apiRequest(`/api/admin/catalog/products/${productId}`, { method: "DELETE" });
      api.success(labels.deleted);
      await loadProducts();
    } catch (error) {
      api.error(formatApiError(error, locale));
    }
  };

  const uploadImage = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      api.error(labels.maxImage);
      return;
    }
    setUploading(true);
    try {
      const signed = await apiRequest<{ uploadUrl: string; publicUrl: string }>("/api/admin/catalog/images/presign", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });
      const response = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed");
      const images = form.getFieldValue("images") || [];
      form.setFieldValue("images", [...images, { url: signed.publicUrl, altText: file.name.replace(/\.[^.]+$/, "") }]);
    } catch (error) {
      api.error(formatApiError(error, locale, { fallback: labels.uploadFail }));
    } finally {
      setUploading(false);
    }
  };

  const columns: ColumnsType<CatalogProduct> = [
    {
      title: labels.product,
      key: "product",
      width: 340,
      sorter: true,
      sortOrder: sortBy === "title" ? (sortOrder === "asc" ? "ascend" : "descend") : null,
      render: (_, product) => (
        <Space className="slowfit-admin-product-cell">
          {product.images[0] ? <Image src={product.images[0].url} alt={product.images[0].altText} width={54} height={54} preview={false} /> : null}
          <Space orientation="vertical" size={0} className="slowfit-admin-product-copy">
            <Typography.Text strong ellipsis={{ tooltip: product.title }}>{product.title}</Typography.Text>
            <Typography.Text type="secondary" ellipsis={{ tooltip: `/${product.handle}` }}>/{product.handle}</Typography.Text>
          </Space>
        </Space>
      ),
    },
    {
      title: labels.status,
      key: "status",
      width: 140,
      sorter: true,
      sortOrder: sortBy === "status" ? (sortOrder === "asc" ? "ascend" : "descend") : null,
      render: (_, product) => {
        const status = product.status === "ARCHIVED"
            ? { label: labels.archived, color: "default", help: labels.archivedHelp }
          : product.status === "DRAFT" || !product.published
            ? { label: locale === "es" ? "Draft" : labels.draft, color: "gold", help: labels.draftHelp }
            : product.preorderEnabled
              ? { label: locale === "es" ? "Preventa" : "Pre-order", color: "orange", help: labels.preorderHelp }
              : { label: labels.active, color: "green", help: labels.activeHelp };
        return <Tooltip title={status.help}><Tag color={status.color}>{status.label}</Tag></Tooltip>;
      },
    },
    {
      title: labels.stock,
      key: "inventoryTotal",
      width: 100,
      sorter: true,
      sortOrder: sortBy === "inventoryTotal" ? (sortOrder === "asc" ? "ascend" : "descend") : null,
      render: (_, product) => product.inventoryTotal,
    },
    {
      title: labels.price,
      key: "minPrice",
      width: 130,
      sorter: true,
      sortOrder: sortBy === "minPrice" ? (sortOrder === "asc" ? "ascend" : "descend") : null,
      render: (_, product) => new Intl.NumberFormat(locale === "es" ? "es-CR" : "en-US", { style: "currency", currency: "USD" }).format(product.minPrice),
    },
    {
      title: labels.searches,
      key: "searchImpressions",
      width: 110,
      sorter: true,
      sortOrder: sortBy === "searchImpressions" ? (sortOrder === "asc" ? "ascend" : "descend") : null,
      render: (_, product) => product.metric.searchImpressions,
    },
    {
      title: labels.clicks,
      key: "clicks",
      width: 90,
      sorter: true,
      sortOrder: sortBy === "clicks" ? (sortOrder === "asc" ? "ascend" : "descend") : null,
      render: (_, product) => product.metric.clicks,
    },
    {
      title: labels.sold,
      key: "unitsSold",
      width: 90,
      sorter: true,
      sortOrder: sortBy === "unitsSold" ? (sortOrder === "asc" ? "ascend" : "descend") : null,
      render: (_, product) => product.metric.unitsSold,
    },
    {
      title: labels.revenue,
      key: "revenue",
      width: 130,
      sorter: true,
      sortOrder: sortBy === "revenue" ? (sortOrder === "asc" ? "ascend" : "descend") : null,
      render: (_, product) => new Intl.NumberFormat(locale === "es" ? "es-CR" : "en-US", { style: "currency", currency: "USD" }).format(product.metric.revenue),
    },
    {
      title: labels.actions,
      width: 210,
      render: (_, product) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEdit(product)}>{labels.edit}</Button>
          <Popconfirm title={labels.removeConfirm} onConfirm={() => void deleteProduct(product.id)}>
            <Button danger icon={<DeleteOutlined />} aria-label={labels.remove} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AdminShell locale={locale} title={labels.title} subtitle={labels.subtitle} sessionReady={sessionReady}
      authorized={authorized} loginLoading={loginLoading} onLogin={onLogin} onLogout={onLogout}>
      {contextHolder}
      <Space orientation="vertical" size={20} className="slowfit-admin-catalog">
        <Space wrap className="slowfit-admin-toolbar">
          <Space.Compact className="slowfit-admin-search-controls">
            <Input.Search value={search} onChange={(event) => setSearch(event.target.value)} onSearch={() => void loadProducts(1)}
              placeholder={labels.search} allowClear />
            <Select mode="multiple" allowClear showSearch maxTagCount="responsive" value={selectedTags}
              onChange={(values) => { setSelectedTags(values); void loadProducts(1, status, values); }} placeholder={labels.allTags}
              options={availableTags.map((value) => ({ value, label: value }))} />
          </Space.Compact>
          <Select value={status} onChange={(value) => { setStatus(value); void loadProducts(1, value); }} options={[
            { value: "all", label: labels.allStatuses },
            { value: "ACTIVE", label: labels.active },
            { value: "DRAFT", label: labels.draft },
            { value: "ARCHIVED", label: labels.archived },
          ]} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{labels.create}</Button>
        </Space>
        <Spin spinning={loading}>
          {products.length ? <Table rowKey="id" columns={columns} dataSource={products} scroll={{ x: 1360 }} onChange={(pagination, _filters, sorter) => {
            const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter;
            const nextSortBy = activeSorter?.order ? String(activeSorter.columnKey) : "updatedAt";
            const nextSortOrder = activeSorter?.order === "ascend" ? "asc" : "desc";
            setSortBy(nextSortBy);
            setSortOrder(nextSortOrder);
            void loadProducts(pagination.current || 1, status, selectedTags, nextSortBy, nextSortOrder);
          }} pagination={{
            current: page,
            pageSize: 100,
            total,
            showSizeChanger: false,
            showTotal: labels.total,
          }} /> : <Empty description={labels.empty} />}
        </Spin>
      </Space>

      <Modal open={modalOpen} width={920} title={editing ? labels.edit : labels.create} footer={null}
        onCancel={() => setModalOpen(false)} forceRender>
        <Form form={form} layout="vertical" onFinish={saveProduct}>
          <Typography.Title level={5}>{labels.details}</Typography.Title>
          <Row gutter={16}>
            <Col xs={24} md={16}><Form.Item name="title" label={labels.name} rules={[{ required: true, message: labels.required }]}><Input /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="status" label={labels.status}><Select options={[
              { value: "DRAFT", label: labels.draft }, { value: "ACTIVE", label: labels.active }, { value: "ARCHIVED", label: labels.archived },
            ]} /></Form.Item></Col>
          </Row>
          <Form.Item name="handle" label={labels.handle}><Input /></Form.Item>
          <Form.Item name="description" label={labels.description}><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="tags" label={labels.tags}><Select mode="tags" tokenSeparators={[","]} placeholder={labels.tagsHint} /></Form.Item>
          <Space wrap size="large">
            <Form.Item name="published" label={labels.published} valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="preorderEnabled" label={labels.preorder} valuePropName="checked"><Switch /></Form.Item>
          </Space>

          <Typography.Title level={5}>{labels.images}</Typography.Title>
          <Upload accept="image/jpeg,image/png,image/webp,image/avif" showUploadList={false} beforeUpload={(file) => { void uploadImage(file); return false; }}>
            <Button icon={<UploadOutlined />} loading={uploading}>{labels.upload}</Button>
          </Upload>
          <Form.List name="images">
            {(fields, { add, remove }) => <Space orientation="vertical" className="slowfit-form-list">
              {fields.map(({ key, name, ...restField }) => <Card key={key} size="small">
                <Row gutter={12} align="middle">
                  <Col xs={24} md={11}><Form.Item {...restField} name={[name, "url"]} label={labels.imageUrl} rules={[{ required: true, type: "url" }]}><Input /></Form.Item></Col>
                  <Col xs={20} md={11}><Form.Item {...restField} name={[name, "altText"]} label={labels.imageAlt}><Input /></Form.Item></Col>
                  <Col xs={4} md={2}><Button danger icon={<DeleteOutlined />} aria-label={labels.remove} onClick={() => remove(name)} /></Col>
                </Row>
              </Card>)}
              <Button icon={<PlusOutlined />} onClick={() => add({ url: "", altText: "" })}>{labels.addImage}</Button>
            </Space>}
          </Form.List>

          <Typography.Title level={5}>{labels.variants}</Typography.Title>
          <Form.List name="variants" rules={[{ validator: async (_, variants) => { if (!variants?.length) throw new Error(labels.required); } }]}>
            {(fields, { add, remove }, { errors }) => <Space orientation="vertical" className="slowfit-form-list">
              {fields.map(({ key, name, ...restField }, index) => <Card key={key} size="small" title={`${labels.variant} ${index + 1}`} extra={fields.length > 1 ? <Button danger icon={<DeleteOutlined />} onClick={() => remove(name)} /> : null}>
                <Row gutter={12}>
                  <Col xs={12} md={4}><Form.Item {...restField} name={[name, "size"]} label={labels.size} rules={[{ required: true }]}><Input /></Form.Item></Col>
                  <Col xs={12} md={4}>
                    <Form.Item {...restField} name={[name, "color"]} label={labels.color}>
                      <Select allowClear showSearch filterOption={(input, option) => String(option?.value || "").toLowerCase().includes(input.toLowerCase())}
                        onChange={(value) => form.setFieldValue(["variants", name, "colorHex"], getProductColor(value)?.hex || null)}
                        options={productColors.map((color) => ({
                          value: color.value,
                          label: <Space><span className="slowfit-color-swatch" style={{ backgroundColor: color.hex }} />{locale === "es" ? color.labelEs : color.labelEn}</Space>,
                        }))} />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, "colorHex"]} hidden><Input /></Form.Item>
                  </Col>
                  <Col xs={24} md={6}><Form.Item {...restField} name={[name, "sku"]} label={labels.sku}><Input /></Form.Item></Col>
                  <Col xs={8} md={3}><Form.Item {...restField} name={[name, "price"]} label={labels.price} rules={[{ required: true }]}><InputNumber min={0} precision={2} className="slowfit-full-width" /></Form.Item></Col>
                  <Col xs={8} md={3}><Form.Item {...restField} name={[name, "compareAtPrice"]} label={labels.compareAt}><InputNumber min={0} precision={2} className="slowfit-full-width" /></Form.Item></Col>
                  <Col xs={8} md={4}><Form.Item {...restField} name={[name, "inventoryQuantity"]} label={labels.quantity} rules={[{ required: true }]}><InputNumber min={0} precision={0} className="slowfit-full-width" /></Form.Item></Col>
                </Row>
              </Card>)}
              <Form.ErrorList errors={errors} />
              <Button icon={<PlusOutlined />} onClick={() => add({ title: "One Size", size: "One Size", color: null, colorHex: null, sku: "", price: 0, compareAtPrice: null, inventoryQuantity: 0 })}>{labels.addVariant}</Button>
            </Space>}
          </Form.List>
          <Space className="slowfit-modal-actions">
            <Button onClick={() => setModalOpen(false)}>{labels.cancel}</Button>
            <Button type="primary" htmlType="submit" loading={saving}>{labels.save}</Button>
          </Space>
        </Form>
      </Modal>
    </AdminShell>
  );
}