
import React from 'react';
import { Product } from '../types';

interface AdminDashboardProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ products, setProducts }) => {
  const handleDeleteProduct = (id: string) => {
    if (confirm("Kas oled kindel, et soovid selle toote eemaldada?")) {
      setProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-stone-900">Admin Paneel</h1>
        <div className="flex gap-4">
          <div className="bg-white px-4 py-2 rounded-lg border border-stone-200 text-sm">
            <span className="text-stone-500">Kasutajaid kokku:</span> <span className="font-bold">124</span>
          </div>
          <div className="bg-white px-4 py-2 rounded-lg border border-stone-200 text-sm">
            <span className="text-stone-500">Aktiivseid tooteid:</span> <span className="font-bold">{products.length}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
            <div className="p-6 border-b border-stone-100">
              <h2 className="text-xl font-bold">Toodete moderatsioon</h2>
            </div>
            <div className="divide-y divide-stone-100">
              {products.map(p => (
                <div key={p.id} className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <img src={p.image} className="w-12 h-12 rounded object-cover" />
                    <div>
                      <p className="font-bold text-stone-900">{p.title}</p>
                      <p className="text-xs text-stone-500">Müüja: {p.sellerName}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleDeleteProduct(p.id)}
                      className="text-red-500 hover:bg-red-50 p-2 rounded-lg text-sm"
                    >
                      <i className="fa-solid fa-trash"></i> Eemalda
                    </button>
                    <button className="text-stone-400 hover:bg-stone-100 p-2 rounded-lg text-sm">
                      <i className="fa-solid fa-flag"></i> Raporteeri
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6">
            <h2 className="text-xl font-bold mb-6">Rapordid ja kaebused</h2>
            <div className="space-y-4">
              <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                <p className="text-sm font-bold text-red-700">Valed andmed</p>
                <p className="text-xs text-red-600 mt-1">Toode "Värsked kartulid" ei vasta kirjeldusele.</p>
                <div className="flex justify-end mt-2">
                  <button className="text-[10px] font-bold text-red-700 uppercase">Vaata lähemalt</button>
                </div>
              </div>
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <p className="text-sm font-bold text-amber-700">Spämm kommentaarides</p>
                <p className="text-xs text-amber-600 mt-1">Kasutaja "Sander123" postitab reklaame.</p>
                <div className="flex justify-end mt-2">
                  <button className="text-[10px] font-bold text-amber-700 uppercase">Lahenda</button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-emerald-900 rounded-3xl shadow-xl p-6 text-white">
            <h3 className="font-bold text-lg mb-2">Platvormi tervis</h3>
            <p className="text-sm opacity-70 mb-4">Kõik süsteemid on töös. Viimane varukoopia tehti 2 tundi tagasi.</p>
            <div className="h-2 w-full bg-emerald-800 rounded-full overflow-hidden">
               <div className="h-full bg-emerald-400 w-[98%]"></div>
            </div>
            <p className="text-[10px] mt-2 opacity-50 uppercase tracking-widest">Server Uptime: 99.9%</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
