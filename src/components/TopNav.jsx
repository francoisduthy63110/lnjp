export default function TopNav({ active, onChange, chatBadge = 0, notifBadge = 0, meLabel }) {
  const Tab = ({ id, label, badge }) => (
    <button
      onClick={() => onChange(id)}
      className={[
        "flex-1 py-3 rounded-xl font-semibold border",
        active === id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-900",
      ].join(" ")}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {label}
        {badge > 0 ? (
          <span className="text-xs bg-red-600 text-white rounded-full px-2 py-0.5">
            {badge}
          </span>
        ) : null}
      </span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-lg font-bold">LNJP</div>
        <div className="text-sm text-slate-600 truncate max-w-[60%]">{meLabel}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tab id="chat" label="Messagerie" badge={chatBadge} />
        <Tab id="notifs" label="Notifications" badge={notifBadge} />
      </div>
    </div>
  );
}
