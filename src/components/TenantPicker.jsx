import React from 'react';
import { Building2 } from 'lucide-react';
import { C } from '../theme';
import BrandMark from './BrandMark';
import { setActiveTenant } from '../api/tenant';

const ROLE_LABELS = {
  owner: 'Dueño',
  admin_consultorio: 'Administracion del consultorio',
  admin_cafe: 'Administracion de cafeteria',
  doctor: 'Doctor',
  barista: 'Barista',
};

// Pantalla de eleccion de clinica.
//
// Solo aparece cuando el usuario pertenece a mas de una y no hay ninguna
// elegida. Con una sola membresia no hay nada que preguntar y
// resolveInitialTenant ya la dejo activa.
//
// No es un filtro de seguridad: aunque alguien forzara otra clinica, la
// base solo la acepta si esta entre las membresias del JWT. Esto existe
// para que el usuario sepa —y decida— en cual esta trabajando, porque el
// mismo psiquiatra puede tener permisos distintos en cada una.
export default function TenantPicker({ memberships, onSelected, theme }) {
  const isDark = theme === 'dark';
  const entries = Object.entries(memberships || {});

  const choose = (tenantId) => {
    setActiveTenant(tenantId);
    // La sesion se rehidrata para que el rol pase a ser el de esta
    // clinica: el mismo usuario puede ser doctor aqui y administrador
    // alla, y toda la UI depende de ese rol.
    onSelected?.(tenantId);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: isDark ? C.brown : C.cream,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: isDark ? C.brownMid : C.ivory,
          borderRadius: 20,
          padding: 32,
          border: `1px solid ${C.brownAlpha30}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <BrandMark theme={theme} />
        </div>

        <h1 style={{ fontSize: 20, margin: '0 0 6px', color: isDark ? C.cream : C.brown, textAlign: 'center' }}>
          ¿En que consultorio vas a trabajar?
        </h1>
        <p style={{ fontSize: 14, margin: '0 0 24px', color: C.brownLight, textAlign: 'center' }}>
          Tienes acceso a mas de uno. Puedes cambiarlo despues.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map(([tenantId, role]) => (
            <button
              key={tenantId}
              type="button"
              onClick={() => choose(tenantId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '14px 16px',
                borderRadius: 12,
                border: `1px solid ${C.brownAlpha30}`,
                background: isDark ? C.brown : C.creamLight,
                color: isDark ? C.cream : C.brown,
                cursor: 'pointer',
                textAlign: 'left',
                font: 'inherit',
              }}
            >
              <Building2 size={20} color={C.sageDeep} />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontSize: 15 }}>{tenantId}</strong>
                <span style={{ fontSize: 13, color: C.brownLight }}>
                  {ROLE_LABELS[role] || role}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
