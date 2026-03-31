/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Camera, 
  Download, 
  Trash2, 
  Edit2, 
  LogOut, 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  Upload,
  ChevronRight,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Menu,
  FileText,
  ScanLine,
  Shield,
  UserPlus,
  Key,
  Lock,
  Unlock,
  CreditCard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { GoogleGenAI, Type } from "@google/genai";

import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  OperationType, 
  handleFirestoreError 
} from './firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  Timestamp,
  getDocs,
  writeBatch,
  setDoc
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

// --- Types ---

interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  lastUpdated: string;
  ownerId: string;
}

interface Purchase {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  sellingPrice: number;
  totalPrice: number;
  profit: number;
  date: string;
  ownerId: string;
}

interface Sale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  date: string;
  ownerId: string;
}

interface DebtItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Debt {
  id: string;
  personName: string;
  items: DebtItem[];
  totalAmount: number;
  date: string;
  status: 'pending' | 'paid';
  ownerId: string;
}

interface EmployeePermissions {
  canViewInventory: boolean;
  canEditInventory: boolean;
  canViewSales: boolean;
  canEditSales: boolean;
  canViewPurchases: boolean;
  canEditPurchases: boolean;
  canViewDebts: boolean;
  canEditDebts: boolean;
  canAccessTrash: boolean;
  canExport: boolean;
  canImport: boolean;
  canScan: boolean;
}

interface Employee {
  id: string;
  name: string;
  pin: string;
  permissions: EmployeePermissions;
  ownerId: string;
}

interface UserProfile {
  uid: string;
  ownerPin: string;
}

// --- Utils ---

const normalizeString = (str: string) => {
  if (!str) return '';
  const trimmed = str.trim();
  if (!trimmed) return '';
  // Capitalize first letter, lowercase the rest
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const formatCurrency = (value: number) => {
  return `MT ${value.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon }: any) => {
  const variants: any = {
    primary: 'bg-black text-white hover:bg-zinc-800',
    secondary: 'bg-white text-black border border-zinc-200 hover:bg-zinc-50',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'bg-transparent text-zinc-600 hover:bg-zinc-100',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

const Input = ({ label, ...props }: any) => {
  const handleChange = (e: any) => {
    if (props.type === 'number') {
      const val = parseFloat(e.target.value);
      if (val < 0) {
        e.target.value = '0';
      }
    }
    props.onChange?.(e);
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</label>}
      <input
        {...props}
        min={props.type === 'number' ? "0" : props.min}
        onChange={handleChange}
        className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm"
      />
    </div>
  );
};

const Card = ({ children, className = "" }: any) => (
  <div className={`bg-white border border-zinc-200 rounded-xl overflow-hidden ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: any) => {
  const variants: any = {
    default: 'bg-zinc-100 text-zinc-600',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-orange-100 text-orange-700',
    danger: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${variants[variant]}`}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [trash, setTrash] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [activeTab, setActiveTab] = useState<'inventory' | 'sales' | 'purchases' | 'trash' | 'debts'>('inventory');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportDate, setExportDate] = useState('');
  const [exportMonth, setExportMonth] = useState('');
  const [exportYear, setExportYear] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [isImportReviewModalOpen, setIsImportReviewModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [minQuantity, setMinQuantity] = useState<number | ''>('');
  const [maxQuantity, setMaxQuantity] = useState<number | ''>('');
  const [minPrice, setMinPrice] = useState<number | ''>('');
  const [maxPrice, setMaxPrice] = useState<number | ''>('');
  const [showFilters, setShowFilters] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Employee State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [isEmployeeManagementOpen, setIsEmployeeManagementOpen] = useState(false);
  const [isEmployeeLoginOpen, setIsEmployeeLoginOpen] = useState(false);
  const [isOwnerPinModalOpen, setIsOwnerPinModalOpen] = useState(false);
  const [ownerPinAction, setOwnerPinAction] = useState<'exit' | 'manage'>('exit');

  const [isManualRecordModalOpen, setIsManualRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [recordType, setRecordType] = useState<'sale' | 'purchase'>('sale');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'primary';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const qProducts = query(collection(db, 'products'), where('ownerId', '==', user.uid));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    const qTrash = query(collection(db, 'trash'), where('ownerId', '==', user.uid));
    const unsubTrash = onSnapshot(qTrash, (snapshot) => {
      setTrash(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'trash'));

    const qSales = query(collection(db, 'sales'), where('ownerId', '==', user.uid));
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sales'));

    const qPurchases = query(collection(db, 'purchases'), where('ownerId', '==', user.uid));
    const unsubPurchases = onSnapshot(qPurchases, (snapshot) => {
      setPurchases(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Purchase)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'purchases'));

    const qEmployees = query(collection(db, 'employees'), where('ownerId', '==', user.uid));
    const unsubEmployees = onSnapshot(qEmployees, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'employees'));

    const qDebts = query(collection(db, 'debts'), where('ownerId', '==', user.uid));
    const unsubDebts = onSnapshot(qDebts, (snapshot) => {
      setDebts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'debts'));

    const unsubProfile = onSnapshot(doc(db, 'userProfiles', user.uid), (doc) => {
      if (doc.exists()) {
        setUserProfile({ uid: doc.id, ...doc.data() } as UserProfile);
      } else {
        setUserProfile(null);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `userProfiles/${user.uid}`));

    return () => {
      unsubProducts();
      unsubTrash();
      unsubSales();
      unsubPurchases();
      unsubEmployees();
      unsubDebts();
      unsubProfile();
    };
  }, [user]);

  const handleExport = (type: 'products' | 'sales' | 'purchases' | 'debts') => {
    let dataToExport: any[] = [];
    let fileName = '';

    const filterByDate = (itemDate: string) => {
      const d = new Date(itemDate);
      const matchesDate = !exportDate || format(d, 'yyyy-MM-dd') === exportDate;
      const matchesMonth = !exportMonth || format(d, 'MM') === exportMonth;
      const matchesYear = !exportYear || format(d, 'yyyy') === exportYear;
      return matchesDate && matchesMonth && matchesYear;
    };

    if (type === 'products') {
      dataToExport = products.map(p => ({
        Nome: p.name,
        Preço: p.price,
        Quantidade: p.quantity,
        Categoria: p.category,
        'Última Atualização': format(new Date(p.lastUpdated), 'dd/MM/yyyy HH:mm')
      }));
      fileName = 'Inventario_Produtos.xlsx';
    } else if (type === 'sales') {
      dataToExport = sales
        .filter(s => filterByDate(s.date))
        .map(s => ({
          Data: format(new Date(s.date), 'dd/MM/yyyy'),
          Mês: format(new Date(s.date), 'MMMM'),
          Produto: s.productName,
          Quantidade: s.quantity,
          'Preço Unitário': s.unitPrice,
          'Total': s.totalPrice
        }));
      fileName = 'Registro_Vendas.xlsx';
    } else if (type === 'purchases') {
      dataToExport = purchases
        .filter(p => filterByDate(p.date))
        .map(p => ({
          Data: format(new Date(p.date), 'dd/MM/yyyy'),
          Mês: format(new Date(p.date), 'MMMM'),
          Produto: p.productName,
          Quantidade: p.quantity,
          'Preço Unitário': p.unitPrice,
          'Total': p.totalPrice
        }));
      fileName = 'Registro_Compras.xlsx';
    } else if (type === 'debts') {
      dataToExport = debts
        .filter(d => filterByDate(d.date))
        .map(d => ({
          Data: format(new Date(d.date), 'dd/MM/yyyy'),
          Cliente: d.personName,
          Itens: d.items.map(i => `${i.productName} (${i.quantity}x)`).join(', '),
          'Total': d.totalAmount,
          Status: d.status === 'paid' ? 'Pago' : 'Pendente'
        }));
      fileName = 'Registro_Dividas.xlsx';
    }

    if (dataToExport.length === 0) {
      setConfirmModal({
        isOpen: true,
        title: 'Aviso',
        message: 'Nenhum dado encontrado para os filtros selecionados.',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        showCancel: false
      } as any);
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type.charAt(0).toUpperCase() + type.slice(1));
    XLSX.writeFile(wb, fileName);
    setIsExportModalOpen(false);
    // Reset filters after export
    setExportDate('');
    setExportMonth('');
    setExportYear('');
  };

  const handlePayDebt = async (debt: Debt) => {
    try {
      const batch = writeBatch(db);
      const debtRef = doc(db, 'debts', debt.id);
      
      // Update status
      batch.update(debtRef, { status: 'paid' });
      
      // Create sales records
      for (const item of debt.items) {
        const saleRef = doc(collection(db, 'sales'));
        batch.set(saleRef, {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          date: new Date().toISOString(),
          ownerId: user?.uid
        });
      }
      
      await batch.commit();
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'debts');
    }
  };

  const handleDeleteDebt = async (debt: Debt) => {
    try {
      const batch = writeBatch(db);
      const debtRef = doc(db, 'debts', debt.id);
      batch.delete(debtRef);
      
      // Return stock ONLY if it was NOT paid
      if (debt.status !== 'paid') {
        for (const item of debt.items) {
          const productRef = doc(db, 'products', item.productId);
          const product = products.find(p => p.id === item.productId);
          if (product) {
            batch.update(productRef, {
              quantity: product.quantity + item.quantity,
              lastUpdated: new Date().toISOString()
            });
          }
        }
      }
      
      await batch.commit();
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'debts');
    }
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        console.log('Dados importados do Excel:', jsonData);

        if (jsonData.length === 0) {
          setConfirmModal({
            isOpen: true,
            title: 'Aviso',
            message: 'Nenhum dado encontrado na planilha.',
            onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
            showCancel: false
          } as any);
          setIsImporting(false);
          return;
        }

        // --- Improved Mapping Logic ---
        let dataRows = jsonData;
        const headerKeywords = {
          name: ['descricao', 'descrição', 'produto', 'nome', 'item', 'product', 'description'],
          price: ['v. compr', 'v. venda', 'preço', 'preco', 'price', 'valor', 'v.compr', 'v.venda'],
          quantity: ['qnt.', 'quantidade', 'qty', 'quantity', 'quant', 'qnt']
        };

        const mapping = { nameKey: '', priceKey: '', quantityKey: '', fallbackPriceKey: '' };
        let foundHeaders = false;

        // Check if the first row contains header keywords
        const firstRow = jsonData[0];
        for (const key in firstRow) {
          const val = String(firstRow[key]).toLowerCase();
          if (headerKeywords.name.some(k => val.includes(k))) {
            mapping.nameKey = key;
            foundHeaders = true;
          }
          if (headerKeywords.price.some(k => val.includes(k))) {
            if (val.includes('venda') || val.includes('preço')) {
              mapping.priceKey = key;
            } else {
              mapping.fallbackPriceKey = key;
            }
            foundHeaders = true;
          }
          if (headerKeywords.quantity.some(k => val.includes(k))) {
            mapping.quantityKey = key;
            foundHeaders = true;
          }
        }

        // If only fallback price was found, promote it to primary
        if (!mapping.priceKey && mapping.fallbackPriceKey) {
          mapping.priceKey = mapping.fallbackPriceKey;
          mapping.fallbackPriceKey = '';
        }

        if (foundHeaders) {
          dataRows = jsonData.slice(1);
        }

        const processedData = dataRows.map(row => {
          let name = '';
          let price = 0;
          let quantity = 0;

          if (foundHeaders) {
            name = row[mapping.nameKey] || '';
            const p = row[mapping.priceKey];
            const fp = mapping.fallbackPriceKey ? row[mapping.fallbackPriceKey] : undefined;
            price = Number(p || fp || 0);
            quantity = Number(row[mapping.quantityKey] || 0);
          } else {
            // Fallback to flexible mapping for common column names
            name = row.Nome || row.name || row.Product || row.Produto || row.PRODUTO || row.NOME || '';
            price = Number(row.Preço || row.price || row.Price || row.PREÇO || row.PRECO || 0);
            quantity = Number(row.Quantidade || row.quantity || row.Quantity || row.Qty || row.QUANTIDADE || 0);
          }
          
          const category = row.Categoria || row.category || row.Category || row.CATEGORIA || '';
          
          return { 
            name: normalizeString(String(name)), 
            price: isNaN(price) ? 0 : price, 
            quantity: isNaN(quantity) ? 0 : quantity, 
            category: normalizeString(String(category)) 
          };
        }).filter(item => item.name !== '' && item.name.toLowerCase() !== 'descricao' && item.name.toLowerCase() !== 'descrição');

        if (processedData.length === 0) {
          setConfirmModal({
            isOpen: true,
            title: 'Aviso',
            message: 'Nenhum produto válido encontrado. Certifique-se que sua planilha tem colunas para Nome/Descrição, Preço e Quantidade.',
            onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
            showCancel: false
          } as any);
          setIsImporting(false);
          return;
        }

        setImportData(processedData);
        setIsImportReviewModalOpen(true);
      } catch (error) {
        console.error('Erro ao importar Excel:', error);
        setConfirmModal({
          isOpen: true,
          title: 'Erro',
          message: 'Erro ao processar o arquivo. Verifique se é um arquivo Excel válido (.xlsx ou .xls).',
          onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
          variant: 'danger',
          showCancel: false
        } as any);
      } finally {
        setIsImporting(false);
        event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmImport = async () => {
    if (!user || importData.length === 0) return;

    setIsImporting(true);
    try {
      let currentBatch = writeBatch(db);
      let totalCount = 0;
      let batchCount = 0;

      for (const item of importData) {
        const newDocRef = doc(collection(db, 'products'));
        currentBatch.set(newDocRef, {
          name: normalizeString(item.name),
          price: item.price,
          quantity: item.quantity,
          category: normalizeString(item.category) || 'Importado',
          ownerId: user.uid,
          lastUpdated: new Date().toISOString()
        });
        totalCount++;
        batchCount++;
        
        if (batchCount === 450) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          batchCount = 0;
        }
      }
      
      if (batchCount > 0) {
        await currentBatch.commit();
      }
      
      setConfirmModal({
        isOpen: true,
        title: 'Sucesso',
        message: `${totalCount} novos produtos cadastrados com sucesso!`,
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        variant: 'primary'
      });
      setIsImportReviewModalOpen(false);
      setImportData([]);
    } catch (error) {
      console.error('Erro ao confirmar importação:', error);
      setConfirmModal({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao salvar os produtos. Tente novamente.',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        variant: 'danger'
      });
    } finally {
      setIsImporting(false);
    }
  };

  const moveToTrash = async (product: Product) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      const trashRef = doc(db, 'trash', product.id);
      const productRef = doc(db, 'products', product.id);
      
      const { id, ...productData } = product;
      batch.set(trashRef, { ...productData, deletedAt: new Date().toISOString() });
      batch.delete(productRef);
      
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `products/${product.id}`);
    }
  };

  const restoreFromTrash = async (product: Product) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      const trashRef = doc(db, 'trash', product.id);
      const productRef = doc(db, 'products', product.id);
      
      const { id, ...productData } = product;
      // Remove deletedAt before restoring
      const { deletedAt, ...restoredData }: any = productData;
      
      batch.set(productRef, restoredData);
      batch.delete(trashRef);
      
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `products/${product.id}`);
    }
  };

  const deletePermanently = async (productId: string) => {
    try {
      await deleteDoc(doc(db, 'trash', productId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `trash/${productId}`);
    }
  };

  const emptyTrash = async () => {
    if (!user || trash.length === 0) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Esvaziar Lixeira',
      message: 'Deseja excluir permanentemente todos os itens da lixeira? Esta ação não pode ser desfeita.',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          let batch = writeBatch(db);
          let count = 0;
          for (const item of trash) {
            batch.delete(doc(db, 'trash', item.id));
            count++;
            if (count === 450) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          if (count > 0) await batch.commit();
        } catch (e) {
          console.error('Erro ao esvaziar lixeira:', e);
        }
      }
    });
  };

  const deleteAllProducts = async () => {
    if (!user || products.length === 0) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Limpar Tudo',
      message: 'Deseja mover todos os produtos para a lixeira?',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          let batch = writeBatch(db);
          let count = 0;
          for (const item of products) {
            const trashRef = doc(db, 'trash', item.id);
            const productRef = doc(db, 'products', item.id);
            const { id, ...data } = item;
            batch.set(trashRef, { ...data, deletedAt: new Date().toISOString() });
            batch.delete(productRef);
            count++;
            if (count === 450) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          if (count > 0) await batch.commit();
        } catch (e) {
          console.error('Erro ao excluir todos os produtos:', e);
        }
      }
    });
  };

  const deleteByCategory = async (category: string) => {
    if (!user) return;
    const categoryProducts = products.filter(p => p.category === category);
    if (categoryProducts.length === 0) return;

    setConfirmModal({
      isOpen: true,
      title: 'Excluir Categoria',
      message: `Deseja mover todos os ${categoryProducts.length} produtos da categoria "${category}" para a lixeira?`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          let batch = writeBatch(db);
          let count = 0;
          for (const item of categoryProducts) {
            const trashRef = doc(db, 'trash', item.id);
            const productRef = doc(db, 'products', item.id);
            const { id, ...data } = item;
            batch.set(trashRef, { ...data, deletedAt: new Date().toISOString() });
            batch.delete(productRef);
            count++;
            if (count === 450) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          if (count > 0) await batch.commit();
        } catch (e) {
          console.error('Erro ao excluir por categoria:', e);
        }
      }
    });
  };

  const deleteSale = async (sale: Sale) => {
    if (!user) return;
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Venda',
      message: `Deseja excluir o registro de venda de "${sale.productName}"? O estoque do produto será restaurado (+${sale.quantity}).`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const batch = writeBatch(db);
          const saleRef = doc(db, 'sales', sale.id);
          const productRef = doc(db, 'products', sale.productId);
          
          // Find current product quantity
          const product = products.find(p => p.id === sale.productId);
          if (product) {
            batch.update(productRef, {
              quantity: product.quantity + sale.quantity,
              lastUpdated: new Date().toISOString()
            });
          }
          
          batch.delete(saleRef);
          await batch.commit();
        } catch (e) {
          console.error('Erro ao excluir venda:', e);
        }
      }
    });
  };

  const deletePurchase = async (purchase: Purchase) => {
    if (!user) return;
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Compra',
      message: `Deseja excluir o registro de compra de "${purchase.productName}"? O estoque do produto será reduzido (-${purchase.quantity}).`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const batch = writeBatch(db);
          const purchaseRef = doc(db, 'purchases', purchase.id);
          const productRef = doc(db, 'products', purchase.productId);
          
          // Find current product quantity
          const product = products.find(p => p.id === purchase.productId);
          if (product) {
            batch.update(productRef, {
              quantity: Math.max(0, product.quantity - purchase.quantity),
              lastUpdated: new Date().toISOString()
            });
          }
          
          batch.delete(purchaseRef);
          await batch.commit();
        } catch (e) {
          console.error('Erro ao excluir compra:', e);
        }
      }
    });
  };

  const deleteAllSales = async () => {
    if (!user || sales.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Limpar Todas as Vendas',
      message: 'Deseja excluir permanentemente todos os registros de vendas? Esta ação não pode ser desfeita.',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          let batch = writeBatch(db);
          let count = 0;
          for (const sale of sales) {
            batch.delete(doc(db, 'sales', sale.id));
            count++;
            if (count === 450) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          if (count > 0) await batch.commit();
        } catch (e) {
          console.error('Erro ao excluir todas as vendas:', e);
        }
      }
    });
  };

  const deleteAllPurchases = async () => {
    if (!user || purchases.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Limpar Todas as Compras',
      message: 'Deseja excluir permanentemente todos os registros de compras? Esta ação não pode ser desfeita.',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          let batch = writeBatch(db);
          let count = 0;
          for (const purchase of purchases) {
            batch.delete(doc(db, 'purchases', purchase.id));
            count++;
            if (count === 450) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          if (count > 0) await batch.commit();
        } catch (e) {
          console.error('Erro ao excluir todas as compras:', e);
        }
      }
    });
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === '' || p.category === filterCategory;
    const matchesMinQty = minQuantity === '' || p.quantity >= Number(minQuantity);
    const matchesMaxQty = maxQuantity === '' || p.quantity <= Number(maxQuantity);
    const matchesMinPrice = minPrice === '' || p.price >= Number(minPrice);
    const matchesMaxPrice = maxPrice === '' || p.price <= Number(maxPrice);

    return matchesSearch && matchesCategory && matchesMinQty && matchesMaxQty && matchesMinPrice && matchesMaxPrice;
  });

  const categories = Array.from(new Set(products.map(p => normalizeString(p.category)))).filter(Boolean);

  const hasPermission = (permission: keyof EmployeePermissions) => {
    if (!currentEmployee) return true; // Owner has all permissions
    return currentEmployee.permissions[permission];
  };

  const handleExitEmployeeMode = () => {
    setOwnerPinAction('exit');
    setIsOwnerPinModalOpen(true);
  };

  const handleManageEmployees = () => {
    if (!userProfile?.ownerPin) {
      // First time setting PIN
      setIsEmployeeManagementOpen(true);
    } else {
      setOwnerPinAction('manage');
      setIsOwnerPinModalOpen(true);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="animate-spin text-zinc-400" size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-50 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="space-y-2">
            <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-black/10">
              <Package className="text-white" size={32} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Inventário</h1>
            <p className="text-zinc-500">Gerencie seu estoque, compras e vendas com inteligência artificial.</p>
          </div>
          <Button onClick={loginWithGoogle} className="w-full py-4 text-lg" icon={TrendingUp}>
            Entrar com Google
          </Button>
          <p className="text-xs text-zinc-400 uppercase tracking-widest font-semibold">Moeda: Metical (MT)</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-50 text-zinc-900 font-sans overflow-hidden">
      {/* Menu Hamburguer Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                    <Package className="text-white" size={16} />
                  </div>
                  <span className="font-bold">Menu</span>
                </div>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <p className="px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Navegação</p>
                {hasPermission('canViewInventory') && (
                  <button
                    onClick={() => { setActiveTab('inventory'); setIsMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'inventory' ? 'bg-black text-white' : 'hover:bg-zinc-100 text-zinc-600'}`}
                  >
                    <Package size={20} />
                    <span className="font-medium">Produtos</span>
                  </button>
                )}
                {hasPermission('canViewSales') && (
                  <button
                    onClick={() => { setActiveTab('sales'); setIsMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'sales' ? 'bg-black text-white' : 'hover:bg-zinc-100 text-zinc-600'}`}
                  >
                    <TrendingUp size={20} />
                    <span className="font-medium">Vendas</span>
                  </button>
                )}
                {hasPermission('canViewPurchases') && (
                  <button
                    onClick={() => { setActiveTab('purchases'); setIsMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'purchases' ? 'bg-black text-white' : 'hover:bg-zinc-100 text-zinc-600'}`}
                  >
                    <ShoppingCart size={20} />
                    <span className="font-medium">Compras</span>
                  </button>
                )}
                {hasPermission('canViewDebts') && (
                  <button
                    onClick={() => { setActiveTab('debts'); setIsMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'debts' ? 'bg-black text-white' : 'hover:bg-zinc-100 text-zinc-600'}`}
                  >
                    <FileText size={20} />
                    <span className="font-medium">Dívidas</span>
                  </button>
                )}
                {hasPermission('canAccessTrash') && (
                  <button
                    onClick={() => { setActiveTab('trash'); setIsMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'trash' ? 'bg-black text-white' : 'hover:bg-zinc-100 text-zinc-600'}`}
                  >
                    <Trash2 size={20} />
                    <span className="font-medium">Lixeira</span>
                  </button>
                )}

                <div className="pt-4 mt-4 border-t border-zinc-100">
                  <p className="px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Ações</p>
                  {hasPermission('canScan') && (
                    <button
                      onClick={() => { setIsScannerOpen(true); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-100 text-zinc-600 transition-all"
                    >
                      <ScanLine size={20} />
                      <span className="font-medium">Digitalizar</span>
                    </button>
                  )}
                  {hasPermission('canImport') && (
                    <button
                      onClick={() => { fileInputRef.current?.click(); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-100 text-zinc-600 transition-all"
                    >
                      <Upload size={20} />
                      <span className="font-medium">Importar Excel</span>
                    </button>
                  )}
                  {hasPermission('canExport') && (
                    <button
                      onClick={() => { setIsExportModalOpen(true); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-100 text-zinc-600 transition-all"
                    >
                      <Download size={20} />
                      <span className="font-medium">Exportar Dados</span>
                    </button>
                  )}
                </div>

                {!currentEmployee && (
                  <div className="pt-4 mt-4 border-t border-zinc-100">
                    <p className="px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Administração</p>
                    <button
                      onClick={() => { handleManageEmployees(); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-100 text-zinc-600 transition-all"
                    >
                      <Plus size={20} />
                      <span className="font-medium">Gerenciar Funcionários</span>
                    </button>
                    <button
                      onClick={() => { setIsEmployeeLoginOpen(true); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-100 text-zinc-600 transition-all"
                    >
                      <LogOut size={20} />
                      <span className="font-medium">Entrar Modo Funcionário</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-zinc-100">
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 text-red-600 transition-all"
                >
                  <LogOut size={20} />
                  <span className="font-medium">Sair da Conta</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMenuOpen(true)} 
            className="p-2 -ml-2 hover:bg-zinc-100 rounded-lg transition-colors"
            aria-label="Abrir menu"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center hidden sm:flex">
              <Package className="text-white" size={20} />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Inventário</h1>
              <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">
                {activeTab === 'inventory' ? 'Produtos' : activeTab === 'sales' ? 'Vendas' : activeTab === 'purchases' ? 'Compras' : 'Lixeira'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef}
            accept=".xlsx, .xls" 
            onChange={handleImportExcel} 
            className="hidden" 
            disabled={isImporting}
          />
          {currentEmployee && (
            <Button variant="danger" onClick={handleExitEmployeeMode} icon={LogOut} className="mr-2">
              Sair do Modo Funcionário
            </Button>
          )}
          {user && (
            <div className="flex items-center gap-2">
              <div className="hidden md:flex flex-col items-end mr-2">
                <span className="text-xs font-bold">{currentEmployee ? currentEmployee.name : user.displayName}</span>
                <span className="text-[10px] text-zinc-400">{currentEmployee ? 'Funcionário' : user.email}</span>
              </div>
              {!currentEmployee && user.photoURL && (
                <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-zinc-200" referrerPolicy="no-referrer" />
              )}
              {currentEmployee && (
                <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 font-bold text-xs">
                  {currentEmployee.name.charAt(0)}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-10">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {hasPermission('canViewInventory') && (
            <Card className="p-3 sm:p-4 flex flex-col gap-0.5">
              <span className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total em Estoque</span>
              <span className="text-lg sm:text-2xl font-light tracking-tight">
                {formatCurrency(products.reduce((acc, p) => acc + (p.price * p.quantity), 0))}
              </span>
            </Card>
          )}
          {hasPermission('canViewSales') && (
            <Card className="p-3 sm:p-4 flex flex-col gap-0.5">
              <span className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Vendas (Mês)</span>
              <span className="text-lg sm:text-2xl font-light tracking-tight text-green-600">
                {formatCurrency(sales
                  .filter(s => new Date(s.date).getMonth() === new Date().getMonth())
                  .reduce((acc, s) => acc + s.totalPrice, 0))}
              </span>
            </Card>
          )}
          {hasPermission('canViewPurchases') && (
            <Card className="p-3 sm:p-4 flex flex-col gap-0.5">
              <span className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Compras (Mês)</span>
              <span className="text-lg sm:text-2xl font-light tracking-tight text-orange-600">
                {formatCurrency(purchases
                  .filter(p => new Date(p.date).getMonth() === new Date().getMonth())
                  .reduce((acc, p) => acc + p.totalPrice, 0))}
              </span>
            </Card>
          )}
          {hasPermission('canViewDebts') && (
            <Card className="p-3 sm:p-4 flex flex-col gap-0.5">
              <span className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total em Dívidas</span>
              <span className="text-lg sm:text-2xl font-light tracking-tight text-red-600">
                {formatCurrency(debts
                  .filter(d => d.status === 'pending')
                  .reduce((acc, d) => acc + d.totalAmount, 0))}
              </span>
            </Card>
          )}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'debts' && (
            <motion.div
              key="debts"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative flex-1 w-full md:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input
                    type="text"
                    placeholder="Pesquisar por nome..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
                  />
                </div>
                <div className="flex gap-2">
                  {hasPermission('canEditDebts') && (
                    <Button onClick={() => { setSelectedDebt(null); setIsDebtModalOpen(true); }} icon={Plus}>
                      Nova Dívida
                    </Button>
                  )}
                </div>
              </div>
              <Card className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Data</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Nome</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Itens</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Total</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Status</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debts
                      .filter(d => d.personName.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((debt) => (
                      <tr key={debt.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-zinc-500">{format(new Date(debt.date), 'dd/MM/yyyy')}</td>
                        <td className="px-6 py-4 font-medium">{debt.personName}</td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex flex-wrap gap-1">
                            {debt.items.map((item, i) => (
                              <Badge key={i}>{item.quantity}x {item.productName}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-bold">{formatCurrency(debt.totalAmount)}</td>
                        <td className="px-6 py-4">
                          <Badge variant={debt.status === 'paid' ? 'success' : 'danger'}>
                            {debt.status === 'paid' ? 'Pago' : 'Pendente'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {hasPermission('canEditDebts') && (
                              <>
                                {debt.status === 'pending' && (
                                  <button 
                                    onClick={() => {
                                      setConfirmModal({
                                        isOpen: true,
                                        title: 'Liquidar Dívida',
                                        message: 'Tem certeza que deseja marcar esta dívida como paga? Os itens serão registrados como vendas e o stock não será alterado.',
                                        onConfirm: () => handlePayDebt(debt)
                                      });
                                    }}
                                    className="p-2 hover:bg-green-50 rounded-lg text-zinc-400 hover:text-green-600 transition-colors"
                                    title="Marcar como Pago"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                )}
                                <button 
                                  onClick={() => { setSelectedDebt(debt); setIsDebtModalOpen(true); }}
                                  className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-black transition-colors"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button 
                                  onClick={() => {
                                    setConfirmModal({
                                      isOpen: true,
                                      title: 'Excluir Dívida',
                                      message: debt.status === 'paid' 
                                        ? 'Tem certeza que deseja excluir este registro de dívida paga? O stock não será alterado.'
                                        : 'Tem certeza que deseja excluir este registro de dívida? O stock será devolvido.',
                                      onConfirm: () => handleDeleteDebt(debt)
                                    });
                                  }}
                                  className="p-2 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {debts.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-zinc-400 italic">
                          Nenhuma dívida registrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>
            </motion.div>
          )}
          {activeTab === 'inventory' && (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="flex items-center gap-2 w-full md:w-auto flex-1">
                    <div className="relative flex-1 md:max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                      <input
                        type="text"
                        placeholder="Pesquisar produtos..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
                      />
                    </div>
                    <Button 
                      variant="secondary" 
                      onClick={() => setShowFilters(!showFilters)}
                      className={showFilters ? 'bg-zinc-100 border-zinc-300' : ''}
                    >
                      Filtros
                    </Button>
                    <Button 
                      variant="danger" 
                      onClick={deleteAllProducts}
                      disabled={products.length === 0 || !hasPermission('canEditInventory')}
                      className="px-3"
                      icon={Trash2}
                    >
                      Limpar Tudo
                    </Button>
                  </div>
                  {hasPermission('canEditInventory') && (
                    <Button onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }} icon={Plus}>
                      Novo Produto
                    </Button>
                  )}
                </div>

                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <Card className="p-4 bg-zinc-50/50 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Categoria</label>
                          <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none text-sm"
                          >
                            <option value="">Todas as categorias</option>
                            {categories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Quantidade</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              placeholder="Min"
                              min="0"
                              value={minQuantity}
                              onChange={(e) => setMinQuantity(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                              className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none text-sm"
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              min="0"
                              value={maxQuantity}
                              onChange={(e) => setMaxQuantity(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                              className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none text-sm"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Preço (MT)</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              placeholder="Min"
                              min="0"
                              value={minPrice}
                              onChange={(e) => setMinPrice(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                              className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none text-sm"
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              min="0"
                              value={maxPrice}
                              onChange={(e) => setMaxPrice(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                              className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none text-sm"
                            />
                          </div>
                        </div>
                        <div className="md:col-span-3 flex justify-between items-center">
                          <div className="flex gap-2">
                            {filterCategory && (
                              <Button 
                                variant="danger" 
                                onClick={() => deleteByCategory(filterCategory)}
                                className="text-[10px] py-1 h-auto"
                              >
                                Excluir Categoria "{filterCategory}"
                              </Button>
                            )}
                          </div>
                          <button 
                            onClick={() => {
                              setFilterCategory('');
                              setMinQuantity('');
                              setMaxQuantity('');
                              setMinPrice('');
                              setMaxPrice('');
                              setSearchQuery('');
                            }}
                            className="text-xs font-bold text-zinc-400 hover:text-black uppercase tracking-widest"
                          >
                            Limpar Filtros
                          </button>
                        </div>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProducts.map((product) => (
                  <Card key={product.id} className="p-4 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <Badge>{product.category}</Badge>
                        <h3 className="font-bold text-lg mt-1">{product.name}</h3>
                      </div>
                      <div className="flex gap-1">
                        {hasPermission('canEditInventory') && (
                          <button 
                            onClick={() => { setEditingProduct(product); setIsProductModalOpen(true); }}
                            className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-black transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                        {hasPermission('canEditInventory') && (
                          <button 
                            onClick={() => moveToTrash(product)}
                            className="p-2 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Preço</span>
                        <span className="text-xl font-medium">{formatCurrency(product.price)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Estoque</span>
                        <div className="flex items-center gap-2 justify-end">
                          <span className={`text-xl font-bold ${product.quantity <= 5 ? 'text-red-500' : 'text-black'}`}>
                            {product.quantity}
                          </span>
                          <span className="text-xs text-zinc-400">unid.</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'sales' && (
            <motion.div
              key="sales"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <div className="flex justify-end gap-2">
                {!currentEmployee && (
                  <Button 
                    onClick={deleteAllSales} 
                    variant="outline" 
                    className="text-red-500 hover:bg-red-50 border-red-200"
                    icon={Trash2}
                  >
                    Limpar Tudo
                  </Button>
                )}
                {hasPermission('canEditSales') && (
                  <Button onClick={() => { setRecordType('sale'); setIsManualRecordModalOpen(true); }} icon={Plus}>
                    Registrar Venda
                  </Button>
                )}
              </div>
              <Card className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Data</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Produto</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Qtd</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Unitário</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Total</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => (
                      <tr key={sale.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-zinc-500">{format(new Date(sale.date), 'dd/MM/yyyy')}</td>
                        <td className="px-4 py-3 font-medium">{sale.productName}</td>
                        <td className="px-4 py-3 text-sm">{sale.quantity}</td>
                        <td className="px-4 py-3 text-sm">{formatCurrency(sale.unitPrice)}</td>
                        <td className="px-4 py-3 font-bold">{formatCurrency(sale.totalPrice)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {hasPermission('canEditSales') && (
                              <button 
                                onClick={() => { setRecordType('sale'); setEditingRecord(sale); setIsManualRecordModalOpen(true); }}
                                className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-black transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                            )}
                            {!currentEmployee && (
                              <button 
                                onClick={() => deleteSale(sale)}
                                className="p-2 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </motion.div>
          )}

          {activeTab === 'purchases' && (
            <motion.div
              key="purchases"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <div className="flex justify-end gap-2">
                {!currentEmployee && (
                  <Button 
                    onClick={deleteAllPurchases} 
                    variant="outline" 
                    className="text-red-500 hover:bg-red-50 border-red-200"
                    icon={Trash2}
                  >
                    Limpar Tudo
                  </Button>
                )}
                {hasPermission('canEditPurchases') && (
                  <Button onClick={() => { setRecordType('purchase'); setIsManualRecordModalOpen(true); }} icon={Plus}>
                    Registrar Compra
                  </Button>
                )}
              </div>
              <Card className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Data</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Produto</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Qtd</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Custo Unit.</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Venda Unit.</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Custo Total</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Lucro Est.</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase) => (
                      <tr key={purchase.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-zinc-500">{format(new Date(purchase.date), 'dd/MM/yyyy')}</td>
                        <td className="px-4 py-3 font-medium">{purchase.productName}</td>
                        <td className="px-4 py-3 text-sm">{purchase.quantity}</td>
                        <td className="px-4 py-3 text-sm">{formatCurrency(purchase.unitPrice)}</td>
                        <td className="px-4 py-3 text-sm">{purchase.sellingPrice ? formatCurrency(purchase.sellingPrice) : '-'}</td>
                        <td className="px-4 py-3 font-bold">{formatCurrency(purchase.totalPrice)}</td>
                        <td className="px-4 py-3 font-bold text-green-600">{purchase.profit ? formatCurrency(purchase.profit) : '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {hasPermission('canEditPurchases') && (
                              <button 
                                onClick={() => { setRecordType('purchase'); setEditingRecord(purchase); setIsManualRecordModalOpen(true); }}
                                className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-black transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                            )}
                            {!currentEmployee && (
                              <button 
                                onClick={() => deletePurchase(purchase)}
                                className="p-2 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </motion.div>
          )}
          {activeTab === 'trash' && (
            <motion.div
              key="trash"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Lixeira ({trash.length})</h2>
                <Button 
                  variant="danger" 
                  onClick={emptyTrash} 
                  disabled={trash.length === 0}
                  icon={Trash2}
                >
                  Esvaziar Lixeira
                </Button>
              </div>

              {trash.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-400 border-2 border-dashed border-zinc-200 rounded-2xl">
                  <Trash2 size={48} className="mb-2 opacity-20" />
                  <p>A lixeira está vazia.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {trash.map((item) => (
                    <Card key={item.id} className="p-4 flex flex-col gap-4 bg-zinc-50/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <Badge>{item.category}</Badge>
                          <h3 className="font-bold text-lg mt-1">{item.name}</h3>
                          <p className="text-[10px] text-zinc-400 mt-1">
                            Excluído em: {format(new Date((item as any).deletedAt), 'dd/MM/yyyy HH:mm')}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => restoreFromTrash(item)}
                            title="Restaurar"
                            className="p-2 hover:bg-green-50 rounded-lg text-zinc-400 hover:text-green-600 transition-colors"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                          <button 
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Excluir Permanentemente',
                                message: 'Deseja excluir permanentemente este item? Esta ação não pode ser desfeita.',
                                variant: 'danger',
                                onConfirm: () => {
                                  deletePermanently(item.id);
                                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                }
                              });
                            }}
                            title="Excluir Permanentemente"
                            className="p-2 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isProductModalOpen && (
          <ProductModal 
            onClose={() => setIsProductModalOpen(false)} 
            product={editingProduct} 
            userId={user.uid} 
          />
        )}
        {isScannerOpen && (
          <ScannerModal 
            onClose={() => setIsScannerOpen(false)} 
            products={products} 
            userId={user.uid} 
            setConfirmModal={setConfirmModal}
          />
        )}
        {isExportModalOpen && (
          <ExportModal 
            onClose={() => setIsExportModalOpen(false)} 
            onExport={handleExport}
            date={exportDate}
            setDate={setExportDate}
            month={exportMonth}
            setMonth={setExportMonth}
            year={exportYear}
            setYear={setExportYear}
          />
        )}
        {isManualRecordModalOpen && (
          <ManualRecordModal 
            onClose={() => { setIsManualRecordModalOpen(false); setEditingRecord(null); }} 
            type={recordType}
            products={products}
            userId={user.uid}
            record={editingRecord}
          />
        )}
        {isDebtModalOpen && (
          <DebtModal 
            onClose={() => { setIsDebtModalOpen(false); setSelectedDebt(null); }} 
            products={products}
            userId={user.uid}
            debt={selectedDebt}
          />
        )}
        {isImportReviewModalOpen && (
          <ImportReviewModal 
            onClose={() => {
              setIsImportReviewModalOpen(false);
              setImportData([]);
            }}
            onConfirm={confirmImport}
            data={importData}
            setData={setImportData}
            loading={isImporting}
          />
        )}
        {isEmployeeManagementOpen && (
          <EmployeeManagementModal 
            onClose={() => setIsEmployeeManagementOpen(false)}
            employees={employees}
            userProfile={userProfile}
            userId={user.uid}
          />
        )}
        {isEmployeeLoginOpen && (
          <EmployeeLoginModal 
            onClose={() => setIsEmployeeLoginOpen(false)}
            employees={employees}
            onLogin={(emp: Employee) => {
              setCurrentEmployee(emp);
              setIsEmployeeLoginOpen(false);
              setActiveTab('inventory');
            }}
          />
        )}
        {isOwnerPinModalOpen && (
          <OwnerPinModal 
            onClose={() => setIsOwnerPinModalOpen(false)}
            correctPin={userProfile?.ownerPin || ''}
            onSuccess={() => {
              setIsOwnerPinModalOpen(false);
              if (ownerPinAction === 'exit') {
                setCurrentEmployee(null);
              } else {
                setIsEmployeeManagementOpen(true);
              }
            }}
          />
        )}
        {confirmModal.isOpen && (
          <ConfirmationModal 
            title={confirmModal.title}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            variant={confirmModal.variant}
            showCancel={(confirmModal as any).showCancel !== false}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

const ConfirmationModal = ({ title, message, onConfirm, onClose, variant = 'primary', showCancel = true }: any) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
    <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-6 text-center">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${variant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-zinc-100 text-black'}`}>
        {variant === 'danger' ? <Trash2 size={24} /> : <CheckCircle2 size={24} />}
      </div>
      <h2 className="font-bold text-lg mb-2">{title}</h2>
      <p className="text-sm text-zinc-500 mb-6">{message}</p>
      <div className="flex gap-3">
        {showCancel && <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>}
        <Button variant={variant} onClick={onConfirm} className="flex-1">Confirmar</Button>
      </div>
    </motion.div>
  </div>
);

const EmployeeManagementModal = ({ onClose, employees, userProfile, userId }: any) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [ownerPin, setOwnerPin] = useState(userProfile?.ownerPin || '');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [formData, setFormData] = useState({
    name: '',
    pin: '',
    permissions: {
      canViewInventory: true,
      canEditInventory: false,
      canViewSales: true,
      canEditSales: false,
      canViewPurchases: true,
      canEditPurchases: false,
      canViewDebts: true,
      canEditDebts: false,
      canAccessTrash: false,
      canExport: false,
      canImport: false,
      canScan: true,
    }
  });

  const handleSaveOwnerPin = async () => {
    if (ownerPin.length < 4) return;
    setIsSavingPin(true);
    setSaveStatus('idle');
    try {
      await setDoc(doc(db, 'userProfiles', userId), { uid: userId, ownerPin });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        ownerId: userId,
      };
      if (editingEmployee) {
        await updateDoc(doc(db, 'employees', editingEmployee.id), data);
      } else {
        await addDoc(collection(db, 'employees'), data);
      }
      setIsAdding(false);
      setEditingEmployee(null);
      setFormData({
        name: '',
        pin: '',
        permissions: {
          canViewInventory: true,
          canEditInventory: false,
          canViewSales: true,
          canEditSales: false,
          canViewPurchases: true,
          canEditPurchases: false,
          canViewDebts: true,
          canEditDebts: false,
          canAccessTrash: false,
          canExport: false,
          canImport: false,
          canScan: true,
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  const deleteEmployee = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'employees', id));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="font-bold text-lg">Gerenciar Funcionários</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Owner PIN Section */}
          <section className="p-4 bg-zinc-50 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-zinc-900 font-bold">
              <Shield size={18} />
              <h3>Senha do Administrador (PIN)</h3>
            </div>
            <p className="text-xs text-zinc-500">Esta senha será solicitada para voltar ao modo administrador ou gerenciar funcionários.</p>
            <div className="flex gap-2">
              <input 
                type="password" 
                maxLength={6}
                placeholder="Mínimo 4 dígitos"
                value={ownerPin}
                onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                className="flex-1 px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
              />
              <Button onClick={handleSaveOwnerPin} disabled={isSavingPin || ownerPin.length < 4}>
                {isSavingPin ? <Loader2 className="animate-spin" size={18} /> : 'Salvar'}
              </Button>
            </div>
            {saveStatus === 'success' && <p className="text-[10px] text-green-600 font-bold flex items-center gap-1"><CheckCircle2 size={12} /> Senha salva com sucesso!</p>}
            {saveStatus === 'error' && <p className="text-[10px] text-red-600 font-bold flex items-center gap-1"><AlertCircle size={12} /> Erro ao salvar senha. Tente novamente.</p>}
          </section>

          {/* Employees List */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-900 font-bold">
                <UserPlus size={18} />
                <h3>Funcionários Cadastrados</h3>
              </div>
              {!isAdding && !editingEmployee && (
                <Button variant="secondary" onClick={() => setIsAdding(true)} icon={Plus}>Adicionar</Button>
              )}
            </div>

            {(isAdding || editingEmployee) ? (
              <form onSubmit={handleSaveEmployee} className="p-4 border border-zinc-200 rounded-xl space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Nome do Funcionário" value={formData.name} onChange={(e: any) => setFormData({ ...formData, name: e.target.value })} required />
                  <Input label="PIN de Acesso" type="password" maxLength={6} value={formData.pin} onChange={(e: any) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })} required />
                </div>
                
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Privilégios de Acesso</h4>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                    {Object.keys(formData.permissions).map((perm) => (
                      <label key={perm} className="flex items-center gap-2 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          checked={(formData.permissions as any)[perm]}
                          onChange={(e) => setFormData({
                            ...formData,
                            permissions: { ...formData.permissions, [perm]: e.target.checked }
                          })}
                          className="w-4 h-4 rounded border-zinc-300 text-black focus:ring-black"
                        />
                        <span className="text-sm text-zinc-600 group-hover:text-black transition-colors">
                          {perm === 'canViewInventory' && 'Ver Inventário'}
                          {perm === 'canEditInventory' && 'Editar Inventário'}
                          {perm === 'canViewSales' && 'Ver Vendas'}
                          {perm === 'canEditSales' && 'Editar Vendas'}
                          {perm === 'canViewPurchases' && 'Ver Compras'}
                          {perm === 'canEditPurchases' && 'Editar Compras'}
                          {perm === 'canViewDebts' && 'Ver Dívidas'}
                          {perm === 'canEditDebts' && 'Editar Dívidas'}
                          {perm === 'canAccessTrash' && 'Acessar Lixeira'}
                          {perm === 'canExport' && 'Exportar Dados'}
                          {perm === 'canImport' && 'Importar Dados'}
                          {perm === 'canScan' && 'Digitalizar'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" className="flex-1" onClick={() => { setIsAdding(false); setEditingEmployee(null); }}>Cancelar</Button>
                  <Button className="flex-1" type="submit">Salvar Funcionário</Button>
                </div>
              </form>
            ) : (
              <div className="space-y-2">
                {employees.length === 0 ? (
                  <p className="text-center py-8 text-zinc-400 text-sm">Nenhum funcionário cadastrado.</p>
                ) : (
                  employees.map((emp) => (
                    <div key={emp.id} className="p-4 border border-zinc-100 rounded-xl flex items-center justify-between hover:bg-zinc-50 transition-colors">
                      <div>
                        <h4 className="font-bold">{emp.name}</h4>
                        <div className="flex gap-1 mt-1">
                          {Object.entries(emp.permissions).filter(([_, v]) => v).slice(0, 3).map(([k]) => (
                            <Badge key={k}>{k.replace('can', '')}</Badge>
                          ))}
                          {Object.values(emp.permissions).filter(v => v).length > 3 && <Badge>+...</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => {
                            setEditingEmployee(emp);
                            setFormData({ name: emp.name, pin: emp.pin, permissions: emp.permissions });
                          }}
                          className="p-2 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-black transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => deleteEmployee(emp.id)}
                          className="p-2 hover:bg-red-100 rounded-lg text-zinc-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
};

const EmployeeLoginModal = ({ onClose, employees, onLogin }: any) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const employee = employees.find((emp: any) => emp.pin === pin);
    if (employee) {
      onLogin(employee);
    } else {
      setError('PIN incorreto. Tente novamente.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-8 text-center">
        <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Key size={32} className="text-zinc-400" />
        </div>
        <h2 className="font-bold text-xl mb-2">Login de Funcionário</h2>
        <p className="text-sm text-zinc-500 mb-8">Insira seu PIN de acesso para entrar no sistema.</p>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="flex justify-center gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`w-12 h-16 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${pin.length > i ? 'border-black bg-black text-white' : 'border-zinc-200 bg-zinc-50'}`}>
                {pin.length > i ? '•' : ''}
              </div>
            ))}
          </div>
          <input 
            autoFocus
            type="password" 
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setError('');
              setPin(e.target.value.replace(/\D/g, ''));
            }}
            className="sr-only"
          />
          
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  if (num === 'C') setPin('');
                  else if (num === 'OK') { if (pin.length >= 4) handleLogin({ preventDefault: () => {} } as any); }
                  else if (pin.length < 4) setPin(prev => prev + num);
                }}
                className={`h-14 rounded-xl font-bold text-lg transition-all active:scale-95 ${num === 'OK' ? 'bg-black text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900'}`}
              >
                {num}
              </button>
            ))}
          </div>

          <Button variant="ghost" onClick={onClose} className="w-full">Cancelar</Button>
        </form>
      </motion.div>
    </div>
  );
};

const OwnerPinModal = ({ onClose, correctPin, onSuccess }: any) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (pin.length === correctPin.length && pin.length > 0) {
      if (pin === correctPin) {
        onSuccess();
      } else {
        setError('PIN incorreto.');
        setPin('');
      }
    }
  }, [pin, correctPin, onSuccess]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === correctPin) {
      onSuccess();
    } else {
      setError('PIN incorreto.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-8 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock size={32} className="text-red-500" />
        </div>
        <h2 className="font-bold text-xl mb-2">Autenticação do Administrador</h2>
        <p className="text-sm text-zinc-500 mb-8">Insira o PIN do administrador para continuar.</p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex justify-center gap-2">
            {[...Array(correctPin.length)].map((_, i) => (
              <div key={i} className={`w-12 h-16 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${pin.length > i ? 'border-red-500 bg-red-500 text-white' : 'border-zinc-200 bg-zinc-50'}`}>
                {pin.length > i ? '•' : ''}
              </div>
            ))}
          </div>
          <input 
            autoFocus
            type="password" 
            maxLength={correctPin.length}
            value={pin}
            onChange={(e) => {
              setError('');
              setPin(e.target.value.replace(/\D/g, ''));
            }}
            className="sr-only"
          />
          
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  if (num === 'C') setPin('');
                  else if (num === 'OK') { if (pin.length === correctPin.length) handleSubmit({ preventDefault: () => {} } as any); }
                  else if (pin.length < correctPin.length) setPin(prev => prev + num);
                }}
                className={`h-14 rounded-xl font-bold text-lg transition-all active:scale-95 ${num === 'OK' ? 'bg-black text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900'}`}
              >
                {num}
              </button>
            ))}
          </div>

          <Button variant="ghost" onClick={onClose} className="w-full">Cancelar</Button>
        </form>
      </motion.div>
    </div>
  );
};

const ManualRecordModal = ({ onClose, type, products, userId, record }: any) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    productId: record?.productId || '',
    productName: record?.productName || '',
    category: record?.category || '',
    quantity: record?.quantity || 1,
    unitPrice: record?.unitPrice || 0, // Cost Price
    sellingPrice: record?.sellingPrice || 0, // Selling Price
    date: record?.date ? format(new Date(record.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
  });

  const [entryMode, setEntryMode] = useState<'unit' | 'bulk'>('unit');
  const [bulkData, setBulkData] = useState({
    boxes: 1,
    itemsPerBox: 1,
    pricePerBox: 0
  });

  // Update quantity and unitPrice when bulkData changes
  useEffect(() => {
    if (entryMode === 'bulk') {
      const totalQty = bulkData.boxes * bulkData.itemsPerBox;
      const unitCost = bulkData.itemsPerBox > 0 ? bulkData.pricePerBox / bulkData.itemsPerBox : 0;
      setFormData(prev => ({
        ...prev,
        quantity: totalQty,
        unitPrice: unitCost
      }));
    }
  }, [bulkData, entryMode]);

  const handleNumberChange = (field: string, value: string) => {
    const num = Math.max(0, parseFloat(value) || 0);
    setFormData(prev => ({ ...prev, [field]: num }));
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredProducts = products.filter((p: any) => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedProduct = products.find((p: any) => p.id === formData.productId);

  useEffect(() => {
    if (selectedProduct && type === 'sale') {
      setFormData(prev => ({ ...prev, unitPrice: selectedProduct.price }));
    }
  }, [selectedProduct, type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    let targetProductId = formData.productId;
    let targetProductName = '';
    let targetCategory = formData.category;

    if (type === 'sale') {
      if (!selectedProduct) return;
      targetProductName = selectedProduct.name;
    } else {
      // For purchase, check if product exists by name
      const normalizedInputName = normalizeString(formData.productName);
      const existingProduct = products.find((p: any) => normalizeString(p.name) === normalizedInputName);
      
      if (existingProduct) {
        targetProductId = existingProduct.id;
        targetProductName = existingProduct.name;
        targetCategory = existingProduct.category;
      } else {
        // Create new product first if it doesn't exist
        targetProductName = formData.productName;
      }
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      let finalProductId = targetProductId;

      if (type === 'purchase' && !targetProductId) {
        // Create new product document
        const newProductRef = doc(collection(db, 'products'));
        finalProductId = newProductRef.id;
        batch.set(newProductRef, {
          name: normalizeString(targetProductName),
          category: normalizeString(targetCategory),
          price: Number(formData.sellingPrice), // Use selling price for inventory
          quantity: Number(formData.quantity),
          ownerId: userId,
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
      } else {
        // Update existing product
        const productRef = doc(db, 'products', targetProductId);
        const currentProduct = products.find((p: any) => p.id === targetProductId);
        
        if (currentProduct) {
          let newQuantity = currentProduct.quantity;
          
          if (record) {
            // If editing, first revert the old record's impact
            if (record.productId === targetProductId) {
              // Same product: adjust by difference
              const diff = Number(formData.quantity) - record.quantity;
              newQuantity = type === 'sale' 
                ? currentProduct.quantity - diff
                : currentProduct.quantity + diff;
            } else {
              // Product changed: revert old, apply new
              // 1. Revert old product (if it exists)
              const oldProduct = products.find((p: any) => p.id === record.productId);
              if (oldProduct) {
                const oldProductRef = doc(db, 'products', record.productId);
                const revertedQty = type === 'sale'
                  ? oldProduct.quantity + record.quantity
                  : oldProduct.quantity - record.quantity;
                batch.update(oldProductRef, { quantity: revertedQty, lastUpdated: new Date().toISOString() });
              }
              // 2. Apply new product
              newQuantity = type === 'sale'
                ? currentProduct.quantity - Number(formData.quantity)
                : currentProduct.quantity + Number(formData.quantity);
            }
          } else {
            // New record
            newQuantity = type === 'sale' 
              ? currentProduct.quantity - Number(formData.quantity)
              : currentProduct.quantity + Number(formData.quantity);
          }

          if (type === 'sale' && newQuantity < 0) {
            setError(`Estoque insuficiente. Disponível: ${currentProduct.quantity}`);
            setLoading(false);
            return;
          }

          batch.update(productRef, {
            quantity: newQuantity,
            // Update price on purchase to the new selling price
            price: type === 'purchase' ? Number(formData.sellingPrice) : currentProduct.price,
            lastUpdated: new Date().toISOString()
          });
        }
      }

      // Add/Update record in sales/purchases
      const recordData: any = {
        productId: finalProductId,
        productName: targetProductName,
        quantity: Number(formData.quantity),
        unitPrice: Number(formData.unitPrice),
        totalPrice: Number(formData.quantity) * Number(formData.unitPrice),
        date: new Date(formData.date + 'T12:00:00').toISOString(),
        ownerId: userId
      };

      if (type === 'purchase') {
        recordData.sellingPrice = Number(formData.sellingPrice);
        recordData.profit = (Number(formData.sellingPrice) - Number(formData.unitPrice)) * Number(formData.quantity);
      }

      const collectionName = type === 'sale' ? 'sales' : 'purchases';
      if (record) {
        const recordRef = doc(db, collectionName, record.id);
        batch.update(recordRef, recordData);
      } else {
        const recordRef = doc(collection(db, collectionName));
        batch.set(recordRef, recordData);
      }

      await batch.commit();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar registro');
      handleFirestoreError(e, record ? OperationType.UPDATE : OperationType.CREATE, type === 'sale' ? 'sales' : 'purchases');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg">
            {record ? 'Editar ' : 'Registrar '}
            {type === 'sale' ? 'Venda' : 'Compra'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          {type === 'sale' ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Buscar Produto</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input 
                    type="text" 
                    placeholder="Nome ou categoria..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Selecionar Produto</label>
                <select 
                  value={formData.productId} 
                  onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
                  required
                >
                  <option value="">Selecione um produto</option>
                  {filteredProducts.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name} (Estoque: {p.quantity})</option>
                  ))}
                </select>
                {filteredProducts.length === 0 && searchTerm && (
                  <p className="text-[10px] text-red-500 font-bold">Nenhum produto encontrado.</p>
                )}
              </div>

              {selectedProduct && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-2"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Detalhes do Produto</span>
                    <Badge variant={selectedProduct.quantity > 5 ? 'success' : 'warning'}>
                      {selectedProduct.quantity} em estoque
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-zinc-500 text-[10px] uppercase font-bold">Categoria</p>
                      <p className="font-medium">{selectedProduct.category || 'Sem categoria'}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500 text-[10px] uppercase font-bold">Preço Atual</p>
                      <p className="font-medium text-green-600">{formatCurrency(selectedProduct.price)}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <>
              <Input 
                label="Nome do Produto" 
                value={formData.productName} 
                onChange={(e: any) => setFormData({ ...formData, productName: e.target.value })} 
                required 
              />
              <Input 
                label="Tipo/Categoria" 
                value={formData.category} 
                onChange={(e: any) => setFormData({ ...formData, category: e.target.value })} 
                required 
              />
            </>
          )}
          
          <Input 
            label="Data" 
            type="date" 
            value={formData.date} 
            onChange={(e: any) => setFormData({ ...formData, date: e.target.value })} 
            required 
          />

          {type === 'purchase' && !record && (
            <div className="flex p-1 bg-zinc-100 rounded-lg">
              <button
                type="button"
                onClick={() => setEntryMode('unit')}
                className={`flex-1 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded-md transition-all ${entryMode === 'unit' ? 'bg-white shadow-sm text-black' : 'text-zinc-500'}`}
              >
                Entrada Unitária
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('bulk')}
                className={`flex-1 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded-md transition-all ${entryMode === 'bulk' ? 'bg-white shadow-sm text-black' : 'text-zinc-500'}`}
              >
                Entrada por Caixas/Lotes
              </button>
            </div>
          )}

          {type === 'purchase' && entryMode === 'bulk' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Input 
                  label="Caixas/Lotes" 
                  type="number" 
                  value={bulkData.boxes} 
                  onChange={(e: any) => setBulkData({ ...bulkData, boxes: Math.max(1, parseInt(e.target.value) || 0) })} 
                  required 
                />
                <Input 
                  label="Itens/Caixa" 
                  type="number" 
                  value={bulkData.itemsPerBox} 
                  onChange={(e: any) => setBulkData({ ...bulkData, itemsPerBox: Math.max(1, parseInt(e.target.value) || 0) })} 
                  required 
                />
                <Input 
                  label="Preço/Caixa" 
                  type="number" 
                  value={bulkData.pricePerBox} 
                  onChange={(e: any) => setBulkData({ ...bulkData, pricePerBox: Math.max(0, parseFloat(e.target.value) || 0) })} 
                  required 
                />
              </div>
              <div className="grid grid-cols-2 gap-4 p-3 bg-zinc-50 rounded-lg border border-dashed border-zinc-200">
                <div>
                  <p className="text-[10px] uppercase font-bold text-zinc-400">Qtd. Total</p>
                  <p className="text-sm font-bold">{formData.quantity}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-zinc-400">Custo Unitário</p>
                  <p className="text-sm font-bold">{formatCurrency(formData.unitPrice)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Input label="Quantidade" type="number" value={formData.quantity} onChange={(e: any) => handleNumberChange('quantity', e.target.value)} required />
                {type === 'sale' && selectedProduct && Number(formData.quantity) > selectedProduct.quantity && (
                  <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                    <AlertCircle size={10} /> Estoque insuficiente!
                  </p>
                )}
              </div>
              <Input label={type === 'purchase' ? "Preço de Custo (MT)" : "Preço Unitário (MT)"} type="number" value={formData.unitPrice} onChange={(e: any) => handleNumberChange('unitPrice', e.target.value)} required />
            </div>
          )}

          {type === 'purchase' && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Preço de Venda (MT)" type="number" value={formData.sellingPrice} onChange={(e: any) => handleNumberChange('sellingPrice', e.target.value)} required />
              <div className="flex flex-col gap-1.5 justify-end pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Lucro Unitário</span>
                <span className={`text-lg font-bold ${Number(formData.sellingPrice) - Number(formData.unitPrice) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(Number(formData.sellingPrice) - Number(formData.unitPrice))}
                </span>
              </div>
            </div>
          )}

          <div className="p-4 bg-zinc-50 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-500">{type === 'purchase' ? 'Custo Total:' : 'Total:'}</span>
              <span className="text-xl font-bold">{formatCurrency(formData.quantity * formData.unitPrice)}</span>
            </div>
            {type === 'purchase' && (
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-zinc-200">
                <span className="text-sm text-zinc-500">Lucro Total Estimado:</span>
                <span className={`text-xl font-bold ${Number(formData.sellingPrice) - Number(formData.unitPrice) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency((Number(formData.sellingPrice) - Number(formData.unitPrice)) * Number(formData.quantity))}
                </span>
              </div>
            )}
          </div>
          <Button type="submit" disabled={loading} className="w-full py-3 mt-4">
            {loading ? <Loader2 className="animate-spin" /> : (record ? 'Salvar Alterações' : 'Salvar Registro')}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

const DebtModal = ({ onClose, products, userId, debt }: any) => {
  const [personName, setPersonName] = useState(debt?.personName || '');
  const [date, setDate] = useState(debt?.date ? format(new Date(debt.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
  const [items, setItems] = useState<DebtItem[]>(debt?.items || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Item selection state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const handleNumberChange = (value: string) => {
    const num = Math.max(0, parseFloat(value) || 0);
    setQuantity(num);
  };

  const selectedProduct = products.find((p: any) => p.id === selectedProductId);

  const addItem = () => {
    if (!selectedProduct) return;
    const existingItem = items.find(item => item.productId === selectedProductId);
    const totalRequested = (existingItem ? existingItem.quantity : 0) + Number(quantity);

    if (selectedProduct.quantity < totalRequested) {
      setError(`Stock insuficiente para ${selectedProduct.name}. Disponível: ${selectedProduct.quantity}`);
      return;
    }
    setError(null);
    
    if (existingItem) {
      setItems(items.map(item => 
        item.productId === selectedProductId 
          ? { ...item, quantity: totalRequested, totalPrice: totalRequested * item.unitPrice }
          : item
      ));
    } else {
      const newItem: DebtItem = {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity: Number(quantity),
        unitPrice: selectedProduct.price,
        totalPrice: Number(quantity) * selectedProduct.price
      };
      setItems([...items, newItem]);
    }
    setSelectedProductId('');
    setQuantity(1);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totalAmount = items.reduce((acc, item) => acc + item.totalPrice, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      const data = {
        personName,
        items,
        totalAmount,
        date: new Date(date + 'T12:00:00').toISOString(),
        status: debt?.status || 'pending',
        ownerId: userId
      };

      if (debt) {
        const debtRef = doc(db, 'debts', debt.id);
        batch.update(debtRef, data);
      } else {
        const debtRef = doc(collection(db, 'debts'));
        batch.set(debtRef, data);
        
        // Decrease stock for new debts
        for (const item of items) {
          const productRef = doc(db, 'products', item.productId);
          const product = products.find((p: any) => p.id === item.productId);
          if (product) {
            batch.update(productRef, {
              quantity: product.quantity - item.quantity,
              lastUpdated: new Date().toISOString()
            });
          }
        }
      }
      
      await batch.commit();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar dívida');
      handleFirestoreError(e, debt ? OperationType.UPDATE : OperationType.CREATE, 'debts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg">{debt ? 'Editar Dívida' : 'Nova Dívida'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <Input label="Nome da Pessoa" value={personName} onChange={(e: any) => setPersonName(e.target.value)} required />
            <Input label="Data" type="date" value={date} onChange={(e: any) => setDate(e.target.value)} required />
          </div>

          <div className="space-y-4 p-4 bg-zinc-50 rounded-xl border border-zinc-200">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Adicionar Itens</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Produto</label>
                <select 
                  value={selectedProductId} 
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
                >
                  <option value="">Selecione um produto</option>
                  {products.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.price)}) - Stock: {p.quantity}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 items-end">
                <Input label="Qtd" type="number" value={quantity} onChange={(e: any) => handleNumberChange(e.target.value)} />
                <Button type="button" onClick={addItem} disabled={!selectedProductId} className="shrink-0 h-[38px]"><Plus size={20} /></Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Itens na Dívida</h3>
            {items.length === 0 ? (
              <p className="text-sm text-zinc-400 italic">Nenhum item adicionado.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-white border border-zinc-100 rounded-lg shadow-sm">
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-zinc-500">{item.quantity}x {formatCurrency(item.unitPrice)}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="font-bold">{formatCurrency(item.totalPrice)}</p>
                      <button type="button" onClick={() => removeItem(index)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-black text-white rounded-xl flex justify-between items-center shrink-0">
            <span className="text-sm font-medium opacity-70">Total da Dívida:</span>
            <span className="text-2xl font-bold">{formatCurrency(totalAmount)}</span>
          </div>

          <Button type="submit" disabled={loading || items.length === 0} className="w-full py-3 mt-4">
            {loading ? <Loader2 className="animate-spin" /> : 'Salvar Dívida'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

const ProductModal = ({ onClose, product, userId }: any) => {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    price: product?.price || 0,
    quantity: product?.quantity || 0,
    category: product?.category || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNumberChange = (field: string, value: string) => {
    const num = Math.max(0, parseFloat(value) || 0);
    setFormData(prev => ({ ...prev, [field]: num }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = {
        name: normalizeString(formData.name),
        price: Number(formData.price),
        quantity: Number(formData.quantity),
        category: normalizeString(formData.category),
        lastUpdated: new Date().toISOString(),
        ownerId: userId,
      };

      if (product) {
        await updateDoc(doc(db, 'products', product.id), data);
      } else {
        await addDoc(collection(db, 'products'), data);
      }
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar produto');
      handleFirestoreError(e, product ? OperationType.UPDATE : OperationType.CREATE, 'products');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg">{product ? 'Editar Produto' : 'Novo Produto'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          <Input 
            label="Nome do Produto" 
            value={formData.name} 
            onChange={(e: any) => setFormData({ ...formData, name: e.target.value })} 
            required 
          />
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Preço (MT)" 
              type="number" 
              value={formData.price} 
              onChange={(e: any) => handleNumberChange('price', e.target.value)} 
              required 
            />
            <Input 
              label="Estoque Inicial" 
              type="number" 
              value={formData.quantity} 
              onChange={(e: any) => handleNumberChange('quantity', e.target.value)} 
              required 
            />
          </div>
          <Input 
            label="Categoria" 
            value={formData.category} 
            onChange={(e: any) => setFormData({ ...formData, category: e.target.value })} 
            placeholder="Ex: Bebidas, Alimentos..."
          />
          <Button type="submit" disabled={loading} className="w-full py-3 mt-4">
            {loading ? <Loader2 className="animate-spin" /> : (product ? 'Salvar Alterações' : 'Adicionar Produto')}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

const ScannerModal = ({ onClose, products, userId, setConfirmModal }: any) => {
  const [step, setStep] = useState<'camera' | 'processing' | 'review'>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (step === 'camera') {
      startCamera();
    }
    return () => stopCamera();
  }, [step]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
  };

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        processImage(dataUrl);
      }
    }
  };

  const processImage = async (base64Image: string) => {
    setStep('processing');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = "gemini-3-flash-preview";
      
      const prompt = `Extract sales or purchase information from this handwritten or printed record. 
      Return a JSON array of objects with: type ('sale' or 'purchase'), productName, quantity, unitPrice (in MZN). 
      If it's a sale, it means quantity was sold. If it's a purchase, it means quantity was bought. 
      Example: [{ "type": "sale", "productName": "Rolom", "quantity": 1, "unitPrice": 50 }]
      Only return the JSON array, no other text.`;

      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Image.split(',')[1] } }
          ]
        },
        config: {
          responseMimeType: "application/json"
        }
      });

      const data = JSON.parse(response.text || '[]');
      setResults(data);
      setStep('review');
    } catch (err) {
      console.error("AI Error:", err);
      setStep('camera');
      setConfirmModal({
        isOpen: true,
        title: 'Erro',
        message: "Erro ao processar imagem. Tente novamente.",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        variant: 'danger',
        showCancel: false
      } as any);
    }
  };

  const confirmResults = async () => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      for (const item of results) {
        // Find product by name (fuzzy match)
        const product = products.find(p => p.name.toLowerCase().includes(item.productName.toLowerCase()));
        
        if (!product) {
          console.warn(`Produto não encontrado: ${item.productName}`);
          continue;
        }

        const recordData = {
          productId: product.id,
          productName: product.name,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.quantity) * Number(item.unitPrice),
          date: new Date().toISOString(),
          ownerId: userId
        };

        if (item.type === 'sale') {
          if (product.quantity < Number(item.quantity)) {
            throw new Error(`Estoque insuficiente para ${product.name}. Disponível: ${product.quantity}`);
          }
          const saleRef = doc(collection(db, 'sales'));
          batch.set(saleRef, recordData);
          
          const productRef = doc(db, 'products', product.id);
          batch.update(productRef, {
            quantity: product.quantity - Number(item.quantity),
            lastUpdated: new Date().toISOString()
          });
        } else {
          const purchaseRef = doc(collection(db, 'purchases'));
          batch.set(purchaseRef, recordData);
          
          const productRef = doc(db, 'products', product.id);
          batch.update(productRef, {
            quantity: product.quantity + Number(item.quantity),
            lastUpdated: new Date().toISOString()
          });
        }
      }

      await batch.commit();
      onClose();
    } catch (err) {
      console.error("Batch error:", err);
      setConfirmModal({
        isOpen: true,
        title: 'Erro',
        message: "Erro ao salvar registros.",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        variant: 'danger',
        showCancel: false
      } as any);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onClose}
        className="absolute inset-0 bg-black/90 backdrop-blur-lg" 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white w-full max-w-2xl h-full md:h-auto md:max-h-[80vh] md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg">Digitalizar Registro</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'camera' && (
            <div className="relative aspect-[3/4] bg-black rounded-2xl overflow-hidden">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 border-2 border-white/20 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-white/50 rounded-3xl border-dashed" />
              </div>
              <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                <button 
                  onClick={capture}
                  className="w-20 h-20 bg-white rounded-full border-8 border-white/20 active:scale-90 transition-transform"
                />
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="h-96 flex flex-col items-center justify-center gap-4">
              <Loader2 className="animate-spin text-black" size={48} />
              <div className="text-center">
                <h3 className="font-bold text-xl">Processando Imagem</h3>
                <p className="text-zinc-500">A IA está extraindo os dados do seu registro...</p>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-100 rounded-2xl">
                <CheckCircle2 className="text-green-500" size={24} />
                <div>
                  <h4 className="font-bold text-green-900">Dados Extraídos</h4>
                  <p className="text-sm text-green-700">Confirme os itens abaixo antes de salvar.</p>
                </div>
              </div>

              <div className="space-y-3">
                {results.map((item, idx) => (
                  <div key={idx} className="p-4 border border-zinc-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.type === 'sale' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                        {item.type === 'sale' ? <TrendingUp size={20} /> : <ShoppingCart size={20} />}
                      </div>
                      <div>
                        <h5 className="font-bold">{item.productName}</h5>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                          {item.type === 'sale' ? 'Venda' : 'Compra'} • {item.quantity} unid.
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(item.quantity * item.unitPrice)}</p>
                      <p className="text-[10px] text-zinc-400">Unit: {item.unitPrice} MT</p>
                    </div>
                  </div>
                ))}
                {results.length === 0 && (
                  <div className="text-center py-12 text-zinc-400">
                    <AlertCircle className="mx-auto mb-2" size={32} />
                    <p>Nenhum dado reconhecido. Tente uma foto mais clara.</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setStep('camera')} className="flex-1 py-4">Tirar outra foto</Button>
                <Button onClick={confirmResults} disabled={loading || results.length === 0} className="flex-1 py-4">
                  {loading ? <Loader2 className="animate-spin" /> : 'Confirmar e Salvar'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const ImportReviewModal = ({ onClose, onConfirm, data, setData, loading }: any) => {
  const updateCategory = (index: number, value: string) => {
    const newData = [...data];
    newData[index].category = normalizeString(value);
    setData(newData);
  };

  const missingCategories = data.filter((item: any) => !item.category).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Revisar Importação</h2>
            <p className="text-xs text-zinc-500">
              {missingCategories > 0 
                ? `Faltam ${missingCategories} categorias. Por favor, preencha-as abaixo.` 
                : 'Tudo pronto para importar! Verifique os dados abaixo.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 border-b border-zinc-100">
                  <th className="pb-3 px-2">Produto</th>
                  <th className="pb-3 px-2">Preço</th>
                  <th className="pb-3 px-2">Qtd</th>
                  <th className="pb-3 px-2">Categoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {data.map((item: any, index: number) => (
                  <tr key={index} className="group hover:bg-zinc-50/50 transition-colors">
                    <td className="py-3 px-2 font-medium text-sm">{item.name}</td>
                    <td className="py-3 px-2 text-sm">MT {item.price.toLocaleString()}</td>
                    <td className="py-3 px-2 text-sm">{item.quantity}</td>
                    <td className="py-3 px-2">
                      <div className="relative">
                        <input 
                          type="text"
                          value={item.category}
                          onChange={(e) => updateCategory(index, e.target.value)}
                          placeholder="Escreva a categoria..."
                          className={`w-full bg-white border ${!item.category ? 'border-red-300 ring-4 ring-red-500/5' : 'border-zinc-200'} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 transition-all`}
                        />
                        {!item.category && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500">
                            <AlertCircle size={14} />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-6 border-t border-zinc-200 bg-zinc-50/50 flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1 py-4">Cancelar</Button>
          <Button 
            onClick={onConfirm} 
            disabled={loading || data.some((item: any) => !item.category)} 
            className="flex-1 py-4"
          >
            {loading ? <Loader2 className="animate-spin mx-auto" /> : `Confirmar Importação (${data.length})`}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

const ExportModal = ({ onClose, onExport, date, setDate, month, setMonth, year, setYear }: any) => {
  const months = [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="font-bold text-lg">Exportar para Excel</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Filtros de Data (Opcional)</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold mb-1 text-zinc-500">Data Específica</label>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1 text-zinc-500">Mês</label>
                  <select 
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                  >
                    <option value="">Todos os meses</option>
                    {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-zinc-500">Ano</label>
                  <select 
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                  >
                    <option value="">Todos os anos</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Selecione a Tabela</h3>
            <button 
              onClick={() => onExport('products')}
              className="w-full p-4 flex items-center justify-between bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Package className="text-zinc-400 group-hover:text-black" size={20} />
                <span className="font-bold">Produtos (Estoque)</span>
              </div>
              <ChevronRight size={16} className="text-zinc-300" />
            </button>
            <button 
              onClick={() => onExport('sales')}
              className="w-full p-4 flex items-center justify-between bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <TrendingUp className="text-zinc-400 group-hover:text-black" size={20} />
                <span className="font-bold">Vendas</span>
              </div>
              <ChevronRight size={16} className="text-zinc-300" />
            </button>
            <button 
              onClick={() => onExport('purchases')}
              className="w-full p-4 flex items-center justify-between bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <ShoppingCart className="text-zinc-400 group-hover:text-black" size={20} />
                <span className="font-bold">Compras</span>
              </div>
              <ChevronRight size={16} className="text-zinc-300" />
            </button>
            <button 
              onClick={() => onExport('debts')}
              className="w-full p-4 flex items-center justify-between bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <CreditCard className="text-zinc-400 group-hover:text-black" size={20} />
                <span className="font-bold">Dívidas</span>
              </div>
              <ChevronRight size={16} className="text-zinc-300" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
