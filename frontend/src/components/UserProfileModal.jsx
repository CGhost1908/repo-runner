import React, { useState, useEffect } from "react";

export function UserProfileModal({ isOpen, onClose, userProfile, onSave }) {
  const [name, setName] = useState(userProfile.name);
  const [role, setRole] = useState(userProfile.role);

  useEffect(() => {
    setName(userProfile.name);
    setRole(userProfile.role);
  }, [userProfile]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ name: name.trim() || "Eren", role: role.trim() || "Developer" });
    onClose();
  };

  const initial = (name || "E").charAt(0).toUpperCase();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">User Profile</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="profile-avatar-large">
              <span>{initial}</span>
            </div>
            <div className="form-row">
              <label className="form-label" htmlFor="profileModalName">Full Name</label>
              <input
                id="profileModalName"
                type="text"
                className="text-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <label className="form-label" htmlFor="profileModalRole">Role / Title</label>
              <input
                id="profileModalRole"
                type="text"
                className="text-input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
