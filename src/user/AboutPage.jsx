import React from 'react';
import {
  Coffee, Calendar as CalendarIcon, Brain, Heart, Clock, User, Phone, Mail,
  ChevronRight, ChevronLeft, Plus, Minus, Check, X,
  ShoppingBag, Settings, BarChart3, Users, Sparkles,
  Bell, Trash2, ArrowRight, ArrowLeft,
  CheckCircle2, AlertCircle, MessageCircle, Cake,
  Home, Menu as MenuIcon, LogOut, TrendingUp, DollarSign,
  Zap, Gift, Send, RefreshCw, Filter
} from 'lucide-react';
import { C } from '../theme';
import BrandMark from '../components/BrandMark';

export default function AboutPage() {
  return (
    <div style={{ padding: '40px 20px 60px', maxWidth: 800, margin: '0 auto' }}>
      <div className="animate-fade-up" style={{ textAlign: 'center', marginBottom: 40 }}>
        <BrandMark size={64} />
        <h1 className="font-display" style={{ fontSize: 38, fontWeight: 600, color: C.brown, margin: '20px 0 8px', letterSpacing: '-0.02em' }}>Quiénes somos</h1>
        <p className="font-script" style={{ fontSize: 22, color: C.sageDark, margin: 0 }}>Un cafecito y lo hablamos</p>
      </div>

      {[
        { title: 'Propósito', icon: Sparkles, body: 'Romper el estigma de ir a terapia y transformar la forma en que las personas se relacionan con su salud mental, convirtiéndola en algo cotidiano, accesible y humano.', color: C.caramel },
        { title: 'Misión', icon: Heart, body: 'En BrainPsi + Coffee creamos un espacio donde la salud mental se vive de forma cercana, cálida y accesible. Brindamos atención psicológica y neuropsicológica para niños y adultos, mientras integramos una experiencia de cafetería que invita a pausar, reflexionar y conectar con uno mismo y con los demás.', color: C.sageDark },
        { title: 'Visión', icon: Brain, body: 'Ser un referente innovador en bienestar emocional, donde la psicología salga del consultorio tradicional y se integre a la vida cotidiana, creando una comunidad que valore el autocuidado, la conversación y la salud mental.', color: C.rust }
      ].map((item, i) => (
        <div key={item.title} className="animate-fade-up" style={{
          background: C.creamLight, border: `1px solid ${C.sagePale}`, borderRadius: 22, padding: 28,
          marginBottom: 16, animationDelay: `${i * 0.1}s`, opacity: 0, animationFillMode: 'forwards'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <item.icon size={22} color={C.cream} strokeWidth={1.5} />
            </div>
            <h2 className="font-display" style={{ fontSize: 28, fontWeight: 500, color: C.brown, margin: 0, letterSpacing: '-0.02em' }}>{item.title}</h2>
          </div>
          <p style={{ fontSize: 15, color: C.brownMid, lineHeight: 1.7, margin: 0 }}>{item.body}</p>
        </div>
      ))}

      <div style={{ marginTop: 30, padding: 24, background: 'var(--bp-primary)', borderRadius: 22, color: 'var(--bp-primary-contrast)', textAlign: 'center' }}>
        <div className="font-script" style={{ fontSize: 24, color: C.caramelLight, marginBottom: 6 }}>Hecho con pasión para ti</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>@brainpsicoffee</div>
      </div>
    </div>
  );
}

// ============ BOOKING FLOW ============
