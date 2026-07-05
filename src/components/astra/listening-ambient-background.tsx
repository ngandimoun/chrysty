export function ListeningAmbientBackground() {
  return (
    <div className="absolute inset-0 hidden overflow-hidden dark:block" aria-hidden>
      <div
        className="listening-blob-drift-a absolute -left-[10%] -top-[15%] size-[70vmin] rounded-full opacity-90 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(255, 45, 158, 0.1) 0%, transparent 70%)',
        }}
      />
      <div
        className="listening-blob-drift-b absolute -bottom-[20%] -right-[10%] size-[65vmin] rounded-full opacity-80 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(74, 222, 128, 0.065) 0%, transparent 70%)',
        }}
      />
      <div
        className="listening-blob-drift-c absolute left-1/2 top-[5%] size-[75vmin] rounded-full opacity-85 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(31, 213, 249, 0.09) 0%, transparent 68%)',
        }}
      />
    </div>
  );
}
