export default function SkeletonCard() {
  return (
    <div
      style={{
        background: '#111111',
        border: '1px solid #1E1E1E',
        borderRadius: 16,
        padding: 20,
        animation: 'skeletonPulse 1.5s ease-in-out infinite',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ background: '#1E1E1E', borderRadius: 8, width: 80, height: 32 }} />
        <div style={{ background: '#1E1E1E', borderRadius: 20, width: 60, height: 24 }} />
      </div>
      <div style={{ background: '#1E1E1E', borderRadius: 6, width: '60%', height: 13, marginBottom: 10 }} />
      <div style={{ background: '#1E1E1E', borderRadius: 6, width: '80%', height: 13 }} />
    </div>
  );
}
