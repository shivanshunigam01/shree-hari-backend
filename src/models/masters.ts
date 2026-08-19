import mongoose, { Schema, type Model } from "mongoose";

const opts = { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } };

function modelOf(name: string, def: Record<string, unknown>): Model<any> {
  return mongoose.models[name] || mongoose.model(name, new Schema(def as any, opts));
}

const soft = { active: { type: Boolean, default: true }, created_by: String, updated_by: String, is_demo: { type: Boolean, default: false } };

export const Customer = modelOf("Customer", {
  name: { type: String, required: true },
  contact_person: String,
  email: String,
  phone: String,
  city: String,
  address: String,
  notes: String,
  country: String,
  tax_id: String,
  ...soft,
});

export const Product = modelOf("Product", {
  name: { type: String, required: true },
  hsn_code: String,
  unit: String,
  default_rate: Number,
  description: String,
  dimensions: String,
  image_url: String,
  brand_name: String,
  origin_country: { type: String, default: "INDIA" },
  ...soft,
});

export const Country = modelOf("Country", {
  name: { type: String, required: true },
  code: String,
  ...soft,
});

export const Port = modelOf("Port", {
  name: { type: String, required: true },
  code: String,
  port_type: String,
  country: String,
  address: String,
  ...soft,
});

export const ShippingLine = modelOf("ShippingLine", {
  name: { type: String, required: true },
  code: String,
  ...soft,
});

export const Bank = modelOf("Bank", {
  bank_name: { type: String, required: true },
  account_no: String,
  swift_code: String,
  ifsc_code: String,
  branch: String,
  ad_code: String,
  ...soft,
});

export const Supplier = modelOf("Supplier", {
  name: { type: String, required: true },
  address: String,
  country: String,
  contact_person: String,
  email: String,
  phone: String,
  gst_no: String,
  factory_address: String,
  ...soft,
});

export const Notification = modelOf("Notification", {
  title: String,
  body: String,
  message: String,
  type: String,
  entity_type: String,
  entity_id: String,
  read: { type: Boolean, default: false },
  isRead: { type: Boolean, default: false },
  user_id: String,
});

export const MASTER_MODELS: Record<string, Model<any>> = {
  customers: Customer,
  products: Product,
  countries: Country,
  ports: Port,
  shipping_lines: ShippingLine,
  banks: Bank,
  suppliers: Supplier,
};

export const MASTER_TABLES = Object.keys(MASTER_MODELS);
