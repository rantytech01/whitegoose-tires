export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  size: string;
  condition: "New" | "Used";
  price: number;
  stock: number;
  description: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: "pending" | "confirmed" | "packed" | "dispatched" | "delivered" | "cancelled";
  total: number;
}
