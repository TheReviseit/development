"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./workload.module.css";

interface Staff {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  is_default: boolean;
  inherit_business_hours: boolean;
  work_schedule: Record<
    string,
    { start: string; end: string; enabled: boolean }
  > | null;
  display_order: number;
  staff_service_assignments: { service_id: string; priority: number }[];
}

interface Service {
  id: string;
  name: string;
  is_active: boolean;
}

export default function WorkloadPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    is_active: true,
    inherit_business_hours: true,
    service_ids: [] as string[],
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [staffRes, servicesRes] = await Promise.all([
        fetch("/api/staff"),
        fetch("/api/services"),
      ]);

      const staffData = await staffRes.json();
      const servicesData = await servicesRes.json();

      if (staffData.success) setStaff(staffData.data);
      if (servicesData.success)
        setServices(servicesData.data.filter((s: Service) => s.is_active));
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenModal = (staffMember?: Staff) => {
    if (staffMember) {
      setEditingStaff(staffMember);
      setFormData({
        name: staffMember.name,
        email: staffMember.email || "",
        phone: staffMember.phone || "",
        is_active: staffMember.is_active,
        inherit_business_hours: staffMember.inherit_business_hours,
        service_ids:
          staffMember.staff_service_assignments?.map((a) => a.service_id) || [],
      });
    } else {
      setEditingStaff(null);
      setFormData({
        name: "",
        email: "",
        phone: "",
        is_active: true,
        inherit_business_hours: true,
        service_ids: [],
      });
    }
    setError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingStaff(null);
    setError(null);
  };

  const handleToggleService = (serviceId: string) => {
    setFormData((prev) => ({
      ...prev,
      service_ids: prev.service_ids.includes(serviceId)
        ? prev.service_ids.filter((id) => id !== serviceId)
        : [...prev.service_ids, serviceId],
    }));
  };

  const handleSelectAllServices = () => {
    setFormData((prev) => ({
      ...prev,
      service_ids:
        prev.service_ids.length === services.length
          ? []
          : services.map((s) => s.id),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError("Staff name is required");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        is_active: formData.is_active,
        inherit_business_hours: formData.inherit_business_hours,
        service_ids: formData.service_ids,
      };

      const url = editingStaff ? `/api/staff/${editingStaff.id}` : "/api/staff";
      const method = editingStaff ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      handleCloseModal();
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (staffMember: Staff) => {
    try {
      await fetch(`/api/staff/${staffMember.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !staffMember.is_active }),
      });
      fetchData();
    } catch (err) {
      console.error("Error toggling status:", err);
    }
  };

  const handleDelete = async (staffMember: Staff) => {
    if (staffMember.is_default) {
      alert("Cannot delete default staff. Toggle inactive instead.");
      return;
    }
    if (!confirm(`Delete "${staffMember.name}"?`)) return;

    try {
      await fetch(`/api/staff/${staffMember.id}`, { method: "DELETE" });
      fetchData();
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading workload management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>Workload Management</h1>
          <p className={styles.subtitle}>
            Manage staff members and their service assignments
          </p>
        </div>
        <button className={styles.primaryBtn} onClick={() => handleOpenModal()}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Staff
        </button>
      </header>

      {/* Staff Grid */}
      <div className={styles.staffGrid}>
        {staff.map((member) => (
          <div
            key={member.id}
            className={`${styles.staffCard} ${!member.is_active ? styles.inactive : ""}`}
          >
            <div className={styles.staffHeader}>
              <div className={styles.avatar}>
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt={member.name} />
                ) : (
                  <span>{member.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className={styles.staffInfo}>
                <h3 className={styles.staffName}>
                  {member.name}
                  {member.is_default && (
                    <span className={styles.defaultBadge}>Default</span>
                  )}
                </h3>
                {!member.is_active && (
                  <span className={styles.inactiveBadge}>Inactive</span>
                )}
              </div>
            </div>

            <div className={styles.assignedServices}>
              <h4>Assigned Services</h4>
              {member.staff_service_assignments?.length > 0 ? (
                <div className={styles.serviceTags}>
                  {member.staff_service_assignments.map((a) => {
                    const service = services.find((s) => s.id === a.service_id);
                    return service ? (
                      <span key={a.service_id} className={styles.serviceTag}>
                        {service.name}
                      </span>
                    ) : null;
                  })}
                </div>
              ) : (
                <p className={styles.noServices}>No services assigned</p>
              )}
            </div>

            <div className={styles.staffActions}>
              <button
                onClick={() => handleToggleActive(member)}
                className={styles.actionBtn}
              >
                {member.is_active ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={() => handleOpenModal(member)}
                className={styles.actionBtn}
              >
                Edit
              </button>
              {!member.is_default && (
                <button
                  onClick={() => handleDelete(member)}
                  className={styles.deleteBtn}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {staff.length === 0 && (
        <div className={styles.emptyState}>
          <h3>No Staff Members</h3>
          <p>Add your first staff member to manage workload</p>
          <button
            className={styles.primaryBtn}
            onClick={() => handleOpenModal()}
          >
            Add Staff
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <>
          <div className={styles.modalOverlay} onClick={handleCloseModal} />
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{editingStaff ? "Edit Staff" : "Add Staff"}</h2>
              <button className={styles.modalClose} onClick={handleCloseModal}>
                ×
              </button>
            </div>
            <form className={styles.modalForm} onSubmit={handleSubmit}>
              {error && <div className={styles.errorAlert}>{error}</div>}

              <div className={styles.formGroup}>
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Staff member name"
                  disabled={editingStaff?.is_default}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="email@example.com"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData({ ...formData, is_active: e.target.checked })
                    }
                  />
                  <span>Active (available for bookings)</span>
                </label>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formData.inherit_business_hours}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        inherit_business_hours: e.target.checked,
                      })
                    }
                  />
                  <span>Use business hours</span>
                </label>
                <small className={styles.fieldHint}>
                  Uncheck to set custom work schedule
                </small>
              </div>

              {/* Service Assignments */}
              <div className={styles.formGroup}>
                <div className={styles.serviceHeader}>
                  <label>Assigned Services</label>
                  <button
                    type="button"
                    className={styles.selectAllBtn}
                    onClick={handleSelectAllServices}
                  >
                    {formData.service_ids.length === services.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>
                <div className={styles.serviceCheckboxes}>
                  {services.map((service) => (
                    <label key={service.id} className={styles.serviceCheckbox}>
                      <input
                        type="checkbox"
                        checked={formData.service_ids.includes(service.id)}
                        onChange={() => handleToggleService(service.id)}
                      />
                      <span>{service.name}</span>
                    </label>
                  ))}
                </div>
                {services.length === 0 && (
                  <p className={styles.noServices}>
                    No services available. Create services first.
                  </p>
                )}
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingStaff
                      ? "Save Changes"
                      : "Add Staff"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
