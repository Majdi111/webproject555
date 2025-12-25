"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, TestTube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { hoverTransition } from "@/lib/motion";
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';

interface Client {
  id: string;
  name: string;
  cin: string;
  email: string;
  phone: string;
  location: string;
}

interface Product {
  id: string;
  reference?: string;
  name: string;
  price: number;
  stock: number;
}

interface OrderItem {
  productId: string;
  reference?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface TestOrderForm {
  clientId: string;
  clientCIN: string;
  clientName: string;
  orderNumber: string;
  items: OrderItem[];
  taxRate: number;
}

export default function TestPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");

  const [formData, setFormData] = useState<TestOrderForm>({
    clientId: "",
    clientCIN: "",
    clientName: "",
    orderNumber: `ORD-${Date.now()}`,
    items: [{ productId: "", description: "", quantity: 1, unitPrice: 0, totalPrice: 0 }],
    taxRate: 19,
  });

  // Fetch clients and products
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);
        const clientsSnapshot = await getDocs(collection(db, 'clients'));
        const productsSnapshot = await getDocs(collection(db, 'products'));

        setClients(
          clientsSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            cin: doc.data().cin,
            email: doc.data().email,
            phone: doc.data().phone,
            location: doc.data().location,
          }))
        );

        setProducts(
          productsSnapshot.docs.map(doc => ({
            id: doc.id,
            reference: doc.data().reference,
            name: doc.data().name,
            price: doc.data().price || 0,
            stock: doc.data().stock || 0,
          }))
        );
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, []);

  const handleClientChange = (clientId: string) => {
    const selectedClient = clients.find(c => c.id === clientId);
    if (selectedClient) {
      setFormData(prev => ({
        ...prev,
        clientId,
        clientCIN: selectedClient.cin,
        clientName: selectedClient.name,
      }));
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    if (field === "productId") {
      const product = products.find(p => p.id === value);
      newItems[index] = {
        ...newItems[index],
        productId: value,
        reference: product?.reference || product?.id || "",
        description: product?.name || "",
        unitPrice: product?.price || 0,
        totalPrice: (product?.price || 0) * newItems[index].quantity,
      };
    } else if (field === "quantity") {
      const qty = parseInt(value) || 0;
      newItems[index].quantity = qty;
      newItems[index].totalPrice = newItems[index].unitPrice * qty;
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const getStockStatus = (productId: string, requestedQty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return null;
    
    if (product.stock === 0) return { message: '⚠️ Out of stock', color: 'text-destructive' };
    if (product.stock < requestedQty) return { message: `⚠️ Only ${product.stock} available`, color: 'text-destructive' };
    if (product.stock <= 10) return { message: `✓ Low stock (${product.stock})`, color: 'text-orange-500' };
    return { message: `✓ In stock (${product.stock})`, color: 'text-green-600' };
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { productId: "", description: "", quantity: 1, unitPrice: 0, totalPrice: 0 }],
    }));
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const calculateSubtotal = () => {
    return formData.items.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const subtotal = calculateSubtotal();
  const taxAmount = subtotal * (formData.taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || formData.items.length === 0) {
      alert('Please select a client and add at least one item');
      return;
    }

    // Check that all items have a product selected
    if (formData.items.some(item => !item.productId)) {
      alert('Please select a product for all items');
      return;
    }

    // Validate stock availability for all items
    const stockIssues: string[] = [];
    formData.items.forEach((item, index) => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        if (product.stock < item.quantity) {
          stockIssues.push(
            `Item ${index + 1} (${product.name}): Requested ${item.quantity}, but only ${product.stock} available in stock`
          );
        }
      }
    });

    if (stockIssues.length > 0) {
      alert('❌ Insufficient stock:\n\n' + stockIssues.join('\n'));
      return;
    }

    setLoading(true);
    try {
      // Create order - stock will be deducted when order is processed
      await addDoc(collection(db, 'orders'), {
        clientId: formData.clientId,
        clientCIN: formData.clientCIN,
        clientName: formData.clientName,
        orderNumber: formData.orderNumber,
        items: formData.items,
        subtotal,
        taxRate: formData.taxRate,
        taxAmount,
        totalAmount,
        status: 'Pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSuccessMessage(`Order "${formData.orderNumber}" created successfully!`);
      setTimeout(() => setSuccessMessage(""), 5000);

      // Reset form
      setFormData({
        clientId: "",
        clientCIN: "",
        clientName: "",
        orderNumber: `ORD-${Date.now()}`,
        items: [{ productId: "", description: "", quantity: 1, unitPrice: 0, totalPrice: 0 }],
        taxRate: 19,
      });
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-semibold">Loading test data...</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <TestTube className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Test Order Creator
          </h1>
        </div>
        <p className="text-muted-foreground">Create test orders to populate your database for testing</p>
      </motion.div>

      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400"
        >
          ✓ {successMessage}
        </motion.div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Client Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select Client</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client">Client *</Label>
                <Select value={formData.clientId} onValueChange={handleClientChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} ({client.cin})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="orderNumber">Order Number</Label>
                <Input
                  id="orderNumber"
                  value={formData.orderNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, orderNumber: e.target.value }))}
                  placeholder="Order number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="taxRate">Tax Rate (%)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  value={formData.taxRate}
                  onChange={(e) => setFormData(prev => ({ ...prev, taxRate: parseFloat(e.target.value) || 0 }))}
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Items */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Order Items</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {formData.items.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 border rounded-lg space-y-3 bg-muted/30"
                >
                  <div className="flex justify-between items-start">
                    <h4 className="font-semibold">Item {index + 1}</h4>
                    {formData.items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(index)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor={`product-${index}`}>Product *</Label>
                      <Select value={item.productId} onValueChange={(value) => handleItemChange(index, "productId", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(product => (
                            <SelectItem 
                              key={product.id} 
                              value={product.id}
                              disabled={product.stock === 0}
                            >
                              {product.name} (Stock: {product.stock})
                              {product.stock === 0 && ' - OUT OF STOCK'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {item.productId && (
                        <p className={`text-xs font-medium ${getStockStatus(item.productId, item.quantity)?.color}`}>
                          {getStockStatus(item.productId, item.quantity)?.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`quantity-${index}`}>Quantity *</Label>
                      <Input
                        id={`quantity-${index}`}
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                        min="1"
                        step="1"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Unit Price</Label>
                      <Input
                        type="number"
                        value={item.unitPrice}
                        disabled
                        className="bg-muted"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Total Price</Label>
                      <Input
                        type="number"
                        value={item.totalPrice.toFixed(2)}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-right">
              <div className="flex justify-between text-lg">
                <span>Subtotal:</span>
                <span className="font-semibold">{subtotal.toFixed(2)} DT</span>
              </div>
              <div className="flex justify-between text-lg">
                <span>Tax ({formData.taxRate}%):</span>
                <span className="font-semibold">{taxAmount.toFixed(2)} DT</span>
              </div>
              <div className="flex justify-between text-2xl border-t pt-2 mt-2">
                <span className="font-bold">Total:</span>
                <span className="font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  {totalAmount.toFixed(2)} DT
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={hoverTransition}
        >
          <Button
            type="submit"
            disabled={loading || !formData.clientId || formData.items.length === 0}
            className="w-full bg-gradient-to-r from-primary to-primary/80 shadow-lg text-lg h-12"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Creating Order...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-5 w-5" />
                Create Test Order
              </>
            )}
          </Button>
        </motion.div>
      </form>
    </div>
  );
}
