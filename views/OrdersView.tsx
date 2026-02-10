
import React from 'react';
import { User, Order, OrderStatus, Product } from '../types';

interface OrdersViewProps {
  user: User;
  orders: Order[];
  products: Product[];
}

const OrdersView: React.FC<OrdersViewProps> = ({ user, orders, products }) => {
  const myOrders = orders.filter(o => o.buyerId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.NEW: return <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Ootel</span>;
      case OrderStatus.CONFIRMED: return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Kinnitatud</span>;
      case OrderStatus.COMPLETED: return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Täidetud</span>;
      case OrderStatus.CANCELLED: return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Tühistatud</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">Minu tellimused</h1>
      
      {myOrders.length === 0 ? (
        <div className="text-center py-24 bg-stone-50 rounded-3xl border border-stone-200 border-dashed">
          <i className="fa-solid fa-basket-shopping text-4xl text-stone-300 mb-4"></i>
          <p className="text-stone-500">Sul pole veel ühtegi tellimust.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {myOrders.map(order => (
            <div key={order.id} className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-stone-100 flex flex-wrap justify-between items-center gap-4 bg-stone-50/50">
                <div>
                  <p className="text-xs text-stone-400 font-bold uppercase tracking-widest mb-1">Tellimus #{order.id.slice(-6).toUpperCase()}</p>
                  <p className="text-sm text-stone-600">{new Date(order.createdAt).toLocaleDateString()} kl {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="flex items-center gap-4">
                  {getStatusBadge(order.status)}
                  <p className="text-xl font-bold text-emerald-700">{order.total.toFixed(2)}€</p>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {order.items.map((item, idx) => {
                    const prod = products.find(p => p.id === item.productId);
                    return (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-3">
                          <img src={prod?.image} className="w-10 h-10 rounded object-cover bg-stone-100" />
                          <div>
                            <p className="font-bold text-stone-800">{item.title}</p>
                            <p className="text-xs text-stone-500">{item.qty} {prod?.unit || 'tk'} x {item.price}€</p>
                          </div>
                        </div>
                        <p className="font-medium text-stone-900">{(item.qty * item.price).toFixed(2)}€</p>
                      </div>
                    );
                  })}
                </div>
                
                <div className="mt-8 pt-6 border-t border-stone-100 flex justify-between items-end">
                   <div>
                     <p className="text-xs font-bold text-stone-400 uppercase mb-2">Müüja kontakt</p>
                     <div className="flex items-center gap-3">
                        <img src={`https://i.pravatar.cc/150?u=${order.sellerId}`} className="w-8 h-8 rounded-full" />
                        <span className="font-bold text-stone-700">Mati Mets</span>
                     </div>
                   </div>
                   {order.status === OrderStatus.COMPLETED && (
                     <button className="bg-white border border-stone-200 text-stone-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-50 transition-colors">
                       Lisa arvustus
                     </button>
                   )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrdersView;
