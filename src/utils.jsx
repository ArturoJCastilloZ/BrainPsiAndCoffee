import React from 'react';
import { Brain, Heart, Sparkles } from 'lucide-react';

export const formatMXN = (n) => `$${n.toFixed(0)}`;
export const todayISO = () => new Date().toISOString().split('T')[0];
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const dayLabel = (d) => d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
export const fullDayLabel = (d) => d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const uid = () => Math.random().toString(36).slice(2, 9);

export const getServiceIcon = (icon, size = 20) => {
  const props = { size, strokeWidth: 1.6 };
  if (icon === 'brain') return <Brain {...props} />;
  if (icon === 'heart') return <Heart {...props} />;
  return <Sparkles {...props} />;
};

export const generateTimeSlots = () => {
  const slots = [];
  for (let h = 9; h <= 19; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 19) slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
};
