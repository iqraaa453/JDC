import { useEffect, useState } from 'react';
import { en } from './locales/en';
import { ur } from './locales/ur';
import {
  approveAdminRequest,
  createBooking,
  deleteAdminAccount as deleteAdminAccountApi,
  deleteAdminRequest as deleteAdminRequestApi,
  deleteBooking as deleteBookingApi,
  getData,
  getSession,
  login,
  logout,
  register,
  rejectAdminRequest,
  updateBookingStatus
} from './data/database';

const backgroundVideo = new URL('../backgroundvideo.mp4', import.meta.url).href;

export default function MortuarySystem() {
  const [lang, setLang] = useState('en');
  const [activeTab, setActiveTab] = useState('public');
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [loginRole, setLoginRole] = useState('user');
  const [authForm, setAuthForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [bookings, setBookings] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [adminRequests, setAdminRequests] = useState([]);
  const [apiError, setApiError] = useState('');
  const [bookingForm, setBookingForm] = useState({
    name: '',
    phone: '',
    service: 'Ghusl',
    causeOfDeath: '',
    city: '',
    coldStorageDuration: '',
    coldStorageUnit: 'hours',
    details: '',
    address: ''
  });

  const t = lang === 'en' ? en : ur;

  const applyServerData = (serverData) => {
    setUsers(serverData.users);
    setBookings(serverData.bookings);
    setNotifications(serverData.notifications);
    setAdminRequests(serverData.adminRequests || []);
  };

  const refreshData = async () => {
    const serverData = await getData();
    applyServerData(serverData);
  };

  useEffect(() => {
    let active = true;

    const bootstrapFromServer = async () => {
      try {
        const user = await getSession();
        if (!active) return;
        if (!user) return;
        setCurrentUser(user);
        setActiveTab(['admin', 'head-admin'].includes(user.role) ? 'admin' : 'public');
        applyServerData(await getData());
      } catch (error) {
        if (active) setApiError(error.message);
      }
    };

    bootstrapFromServer();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (currentUser) {
      setBookingForm({
        name: currentUser.name,
        phone: currentUser.phone,
        service: 'Ghusl',
        causeOfDeath: '',
        city: '',
        coldStorageDuration: '',
        coldStorageUnit: 'hours',
        details: '',
        address: ''
      });
    }
  }, [currentUser]);

  const isAdmin = Boolean(currentUser && ['admin', 'head-admin'].includes(currentUser.role));
  const isHeadAdmin = currentUser?.role === 'head-admin';
  const isCustomer = currentUser?.role === 'user';

  const handleLanguageToggle = () => setLang(lang === 'en' ? 'ur' : 'en');

  const scrollToMortuarySection = () => {
    setActiveTab('mortuary');
  };

  const openPublicPortal = () => {
    if (currentUser && isAdmin) {
      setActiveTab('admin');
      return;
    }

    setActiveTab('public');
    if (!currentUser) setLoginRole('user');
  };

  const openAdminPortal = () => {
    if (isAdmin) {
      setActiveTab('admin');
      return;
    }

    setCurrentUser(null);
    setAuthMode('login');
    setLoginRole('admin');
    setAuthForm({ name: '', email: '', phone: '', password: '' });
    setActiveTab('admin');
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (authMode === 'register') {
      if (!authForm.name || !authForm.email || !authForm.phone || !authForm.password) {
        alert(lang === 'en' ? 'Please complete all fields.' : 'براہ کرم تمام خانے پوری کریں۔');
        return;
      }

      try {
        const result = await register({ ...authForm, role: loginRole });
        setAuthForm({ name: '', email: '', phone: '', password: '' });
        if (loginRole === 'admin') {
          setAuthMode('login');
          setLoginRole('admin');
          setActiveTab('admin');
          alert(result.message);
          return;
        }

        setCurrentUser(result.user);
        setActiveTab('public');
        applyServerData(await getData());
        alert(lang === 'en' ? 'Registration successful.' : 'رجسٹریشن کامیاب ہوئی۔');
      } catch (error) {
        setApiError(error.message);
      }
      return;
    }

    if (!authForm.email || !authForm.password) {
      alert(lang === 'en' ? 'Please enter email and password.' : 'ای میل اور پاس ورڈ درج کریں۔');
      return;
    }

    try {
      const { user } = await login({
        email: authForm.email,
        password: authForm.password,
        role: loginRole
      });
      setCurrentUser(user);
      setAuthForm({ name: '', email: '', phone: '', password: '' });
      setActiveTab(['admin', 'head-admin'].includes(user.role) ? 'admin' : 'public');
      applyServerData(await getData());
    } catch (error) {
      setApiError(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      setApiError(error.message);
    }
    setCurrentUser(null);
    applyServerData({ users: [], bookings: [], notifications: [], adminRequests: [] });
    setAuthMode('login');
    setLoginRole('user');
    setActiveTab('public');
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!currentUser) {
      alert(lang === 'en' ? 'Please log in to submit a booking request.' : 'بکنگ کے لیے لاگ ان کریں۔');
      return;
    }

    if (
      !bookingForm.name ||
      !bookingForm.phone ||
      !bookingForm.address ||
      !bookingForm.details ||
      !bookingForm.causeOfDeath ||
      !bookingForm.city ||
      (bookingForm.service === 'Cold Storage' && bookingForm.coldStorageDuration === '')
    ) {
      alert(lang === 'en' ? 'Please fill in all booking details.' : 'براہ کرم تمام بکنگ کی تفصیلات پُر کریں۔');
      return;
    }

    try {
      await createBooking(bookingForm);
      await refreshData();
      setBookingForm({
        name: currentUser.name,
        phone: currentUser.phone,
        service: 'Ghusl',
        causeOfDeath: '',
        city: '',
        coldStorageDuration: '',
        coldStorageUnit: 'hours',
        details: '',
        address: ''
      });
      alert(lang === 'en' ? 'Booking request submitted successfully.' : 'بکنگ کامیابی سے جمع ہو گئی۔');
    } catch (error) {
      setApiError(error.message);
    }
  };

  const updateStatus = async (id, newStatus) => {
    if (!isAdmin) return;
    setApiError('');
    try {
      await updateBookingStatus(id, newStatus);
      await refreshData();
    } catch (error) {
      setApiError(error.message);
    }
  };

  const deleteBooking = async (id) => {
    if (!isAdmin) return;
    setApiError('');
    try {
      await deleteBookingApi(id);
      await refreshData();
    } catch (error) {
      setApiError(error.message);
    }
  };

  const updateAdminRequest = async (id, newStatus) => {
    if (!isHeadAdmin) return;
    setApiError('');
    try {
      if (newStatus === 'Approved') {
        await approveAdminRequest(id);
      } else {
        await rejectAdminRequest(id);
      }
      await refreshData();
    } catch (error) {
      setApiError(error.message);
    }
  };

  const deleteAdminRequest = async (id) => {
    if (!isHeadAdmin) return;
    setApiError('');
    try {
      await deleteAdminRequestApi(id);
      await refreshData();
    } catch (error) {
      setApiError(error.message);
    }
  };

  const deleteAdminAccount = async (id) => {
    if (!isHeadAdmin || id === currentUser.id) return;
    setApiError('');
    try {
      await deleteAdminAccountApi(id);
      await refreshData();
    } catch (error) {
      setApiError(error.message);
    }
  };

  const myBookings = currentUser ? bookings.filter(booking => booking.userId === currentUser.id) : [];
  const recentNotifications = currentUser ? notifications.filter(item => item.userId === currentUser.id).slice(0, 5) : [];
  const totalRequests = bookings.length;
  const pendingRequests = bookings.filter(item => item.status === 'Pending').length;
  const approvedRequests = bookings.filter(item => item.status === 'Approved').length;
  const rejectedRequests = bookings.filter(item => item.status === 'Rejected').length;

  const serviceStats = ['Ghusl', 'Burial Slot', 'Transport Service', 'Graveyard Booking', 'Mayat', 'Kafan', 'Cold Storage'].map(service => ({
    service,
    count: bookings.filter(item => item.service === service).length
  }));

  return (
    <div className="app-shell" dir={t.dir}>
      <div className="video-background" aria-hidden="true">
        <video autoPlay muted loop playsInline poster={new URL('../images.jpg', import.meta.url).href}>
          <source src={backgroundVideo} type="video/mp4" />
        </video>
      </div>
      <div className="background-overlay" aria-hidden="true" />

      <header className="app-header">
        <div className="top-strip">
          <div className="top-strip-item">
            <span className="emergency-icon">✚</span>
            <span>AMBULANCE</span>
            <strong>1024</strong>
          </div>
          <div className="top-strip-item contact-strip">
            <span className="phone-icon">◔</span>
            <span>CONTACT US VIA</span>
            <strong>WHATSAPP</strong>
          </div>
          <div className="top-strip-item volunteer-strip">
            <span className="volunteer-icon">👤</span>
            <span>BECOME A VOLUNTEER</span>
          </div>
        </div>

        <div className="nav-row">
          <div className="brand" aria-label="JDC Foundation Pakistan">
            <div className="brand-mark">
              <span>JDC</span>
            </div>
            <div className="brand-copy">
              <small>FOUNDATION</small>
              <span>PAKISTAN</span>
            </div>
          </div>

          <div className="header-actions">
            <button
              type="button"
              onClick={scrollToMortuarySection}
              className={activeTab === 'mortuary' ? 'btn-mortuary active' : 'btn-mortuary'}
            >
              {t.mortuaryServices}
            </button>
            <button
              type="button"
              onClick={openPublicPortal}
              className={activeTab === 'public' ? 'portal-nav-btn active' : 'portal-nav-btn'}
            >
              {t.publicPortal}
            </button>
            <button
              type="button"
              onClick={openAdminPortal}
              className={activeTab === 'admin' ? 'portal-nav-btn active' : 'portal-nav-btn'}
            >
              {activeTab === 'admin' ? t.adminPortal : t.adminDashboard}
            </button>
            {currentUser && (
              <button type="button" onClick={handleLogout} className="btn-logout">
                {t.logout}
              </button>
            )}
            <button onClick={handleLanguageToggle} className="btn-lang">
              {t.toggleLanguage}
            </button>
          </div>
        </div>

        <div className="page-title-wrap">
          <h1>Free Mortuary In Karachi</h1>
        </div>
      </header>

      <main className="main-container">
        {apiError && (
          <div className="badge-info" role="alert">
            {apiError}
          </div>
        )}
        {activeTab === 'public' && (
          <div className="portal-shell">
            {!currentUser ? (
              <div className="auth-layout">
                <div className="auth-card">
                  <div className="auth-header">
                    <button
                      type="button"
                      className={authMode === 'login' ? 'tab-btn active' : 'tab-btn'}
                      onClick={() => setAuthMode('login')}
                    >
                      {t.login}
                    </button>
                    <button
                      type="button"
                      className={authMode === 'register' ? 'tab-btn active' : 'tab-btn'}
                      onClick={() => setAuthMode('register')}
                    >
                      {t.register}
                    </button>
                  </div>

                  {(authMode === 'login' || authMode === 'register') && loginRole === 'admin' && (
                    <div className="badge-info admin-login-note">
                      {authMode === 'register' ? t.adminRegisterNote : t.adminLoginNote}
                    </div>
                  )}

                  <form onSubmit={handleAuthSubmit} className="auth-form">
                    {authMode === 'register' && (
                      <div className="form-group">
                        <label>{t.fullName}</label>
                        <input
                          type="text"
                          className="form-control"
                          autoComplete="name"
                          required
                          value={authForm.name}
                          onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                        />
                      </div>
                    )}

                    <div className="form-group">
                      <label>{t.email}</label>
                      <input
                        type="email"
                        className="form-control"
                        autoComplete="email"
                        required
                        value={authForm.email}
                        onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                      />
                    </div>

                    {authMode === 'register' && (
                      <div className="form-group">
                        <label>{t.contact}</label>
                        <input
                          type="tel"
                          className="form-control"
                          autoComplete="tel"
                          required
                          value={authForm.phone}
                          onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                        />
                      </div>
                    )}

                    <div className="form-group">
                      <label>{t.password}</label>
                      <input
                        type="password"
                        className="form-control"
                        minLength={authMode === 'register' ? 12 : undefined}
                        required
                        autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                        value={authForm.password}
                        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                      />
                      {authMode === 'register' && <small>{t.passwordLengthNote}</small>}
                    </div>

                    <button type="submit" className="btn-submit">
                      {authMode === 'login' ? t.login : t.register}
                    </button>
                  </form>
                </div>

                <div className="info-panel info-panel-image">
                  <h3>JDC IT CITY Khidmat Initiative</h3>
                  <p>
                    This portal provides support for funeral, ghusl, burial, and transport bookings for families in need.
                  </p>
                  <div className="badge-info">
                    <strong>Project Info:</strong> Developed for JDC IT City to streamline mortuary service requests.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="welcome-row">
                  <div className="welcome-card">
                    <h2>{t.welcome}, {currentUser.name}</h2>
                    <p>{t.loginPrompt}</p>
                  </div>
                  <div className="notification-card">
                    <h3>{t.notifications}</h3>
                    {recentNotifications.length ? (
                      <ul>
                        {recentNotifications.map(item => (
                          <li key={item.id}>{item.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>{t.noNotifications}</p>
                    )}
                  </div>
                </div>

                {isCustomer ? (
                  <>
                    <div className="portal-grid">
                      <div className="card">
                        <h2 className="card-title">{t.bookService}</h2>
                        <form onSubmit={handleBookingSubmit}>
                          <div className="form-group">
                            <label>{t.fullName}</label>
                            <input
                              type="text"
                              className="form-control"
                              value={bookingForm.name}
                              onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })}
                            />
                          </div>

                          <div className="form-group">
                            <label>{t.contact}</label>
                            <input
                              type="tel"
                              className="form-control"
                              value={bookingForm.phone}
                              onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                            />
                          </div>

                          <div className="form-group">
                            <label>{t.serviceType}</label>
                            <select
                              className="form-control"
                              value={bookingForm.service}
                              onChange={(e) => setBookingForm({ ...bookingForm, service: e.target.value })}
                            >
                              <option value="Ghusl">{t.ghusl}</option>
                              <option value="Burial Slot">{t.burial}</option>
                              <option value="Transport Service">{t.transport}</option>
                              <option value="Graveyard Booking">{t.graveyard}</option>
                              <option value="Mayat">{t.mayat}</option>
                              <option value="Kafan">{t.kafan}</option>
                              <option value="Cold Storage">{t.coldStorage}</option>
                            </select>
                          </div>

                          <div className="form-group">
                            <label>{t.causeOfDeath}</label>
                            <input
                              type="text"
                              className="form-control"
                              value={bookingForm.causeOfDeath}
                              onChange={(e) => setBookingForm({ ...bookingForm, causeOfDeath: e.target.value })}
                              required
                            />
                          </div>

                          <div className="form-group">
                            <label>{t.cityOfBody}</label>
                            <input
                              type="text"
                              className="form-control"
                              value={bookingForm.city}
                              onChange={(e) => setBookingForm({ ...bookingForm, city: e.target.value })}
                              required
                            />
                          </div>

                          {bookingForm.service === 'Cold Storage' && (
                            <div className="form-group">
                              <label>{t.coldStorageDuration}</label>
                              <div className="duration-input">
                                <input
                                  type="number"
                                  className="form-control"
                                  min="0"
                                  step="any"
                                  value={bookingForm.coldStorageDuration}
                                  onChange={(e) => setBookingForm({ ...bookingForm, coldStorageDuration: e.target.value })}
                                  required
                                />
                                <select
                                  className="form-control"
                                  value={bookingForm.coldStorageUnit}
                                  onChange={(e) => setBookingForm({ ...bookingForm, coldStorageUnit: e.target.value })}
                                  aria-label={t.durationUnit}
                                >
                                  <option value="hours">{t.hours}</option>
                                  <option value="days">{t.days}</option>
                                </select>
                              </div>
                            </div>
                          )}

                          <div className="form-group">
                            <label>{t.address}</label>
                            <input
                              type="text"
                              className="form-control"
                              value={bookingForm.address}
                              onChange={(e) => setBookingForm({ ...bookingForm, address: e.target.value })}
                            />
                          </div>

                          <div className="form-group">
                            <label>{t.serviceDetails}</label>
                            <textarea
                              className="form-control textarea"
                              value={bookingForm.details}
                              onChange={(e) => setBookingForm({ ...bookingForm, details: e.target.value })}
                            />
                          </div>

                          <button type="submit" className="btn-submit">{t.submit}</button>
                        </form>
                      </div>

                      <div className="info-panel">
                        <h3>{t.profile}</h3>
                        <p><strong>{t.fullName}:</strong> {currentUser.name}</p>
                        <p><strong>{t.email}:</strong> {currentUser.email}</p>
                        <p><strong>{t.contact}:</strong> {currentUser.phone}</p>
                        <div className="badge-info">
                          <strong>{t.status}:</strong> {t.publicPortal}
                        </div>
                      </div>
                    </div>

                    <div className="card bookings-card">
                      <h2 className="card-title">{t.myBookings}</h2>
                      {myBookings.length ? (
                        <div className="table-responsive">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>ID</th>
                                <th>{t.serviceType}</th>
                                <th>{t.cityOfBody}</th>
                                <th>{t.causeOfDeath}</th>
                                <th>{t.coldStorageDuration}</th>
                                <th>{t.address}</th>
                                <th>{t.status}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {myBookings.map(booking => (
                                <tr key={booking.id}>
                                  <td>{booking.id}</td>
                                  <td>{booking.service}</td>
                                  <td>{booking.city || '—'}</td>
                                  <td>{booking.causeOfDeath || '—'}</td>
                                  <td>{booking.coldStorageDuration ? `${booking.coldStorageDuration} ${booking.coldStorageUnit || 'hours'}` : '—'}</td>
                                  <td>{booking.address}</td>
                                  <td>
                                    <span className={`status-badge ${
                                      booking.status === 'Approved' ? 'status-approved' :
                                      booking.status === 'Rejected' ? 'status-rejected' : 'status-pending'
                                    }`}>
                                      {booking.status === 'Approved' ? t.approved : booking.status === 'Rejected' ? t.rejected : t.pending}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p>{t.noBookings}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="welcome-row">
                    <div className="welcome-card">
                      <h2>{t.welcome}, {currentUser.name}</h2>
                      <p>Admin accounts are managed in the Admin Portal. Customers can only create booking requests from the customer portal.</p>
                    </div>
                    <div className="notification-card">
                      <h3>{t.notifications}</h3>
                      {recentNotifications.length ? (
                        <ul>
                          {recentNotifications.map(item => (
                            <li key={item.id}>{item.text}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>{t.noNotifications}</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'admin' && !isAdmin && (
          <div className="portal-shell">
            <div className="auth-layout">
              <div className="auth-card">
                <div className="auth-header">
                  <button
                    type="button"
                    className={authMode === 'login' ? 'tab-btn active' : 'tab-btn'}
                    aria-pressed={authMode === 'login'}
                    onClick={() => setAuthMode('login')}
                  >
                    {t.login}
                  </button>
                  <button
                    type="button"
                    className={authMode === 'register' ? 'tab-btn active' : 'tab-btn'}
                    aria-pressed={authMode === 'register'}
                    onClick={() => setAuthMode('register')}
                  >
                    {t.register}
                  </button>
                </div>

                <div className="badge-info admin-login-note">
                  {authMode === 'register' ? t.adminRegisterNote : t.adminLoginNote}
                </div>

                <form onSubmit={handleAuthSubmit} className="auth-form">
                  {authMode === 'register' && (
                    <>
                      <div className="form-group">
                        <label>{t.fullName}</label>
                        <input
                          type="text"
                          className="form-control"
                          autoComplete="name"
                          required
                          value={authForm.name}
                          onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label>{t.contact}</label>
                        <input
                          type="tel"
                          className="form-control"
                          autoComplete="tel"
                          required
                          value={authForm.phone}
                          onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  <div className="form-group">
                    <label>{t.email}</label>
                    <input
                      type="email"
                      className="form-control"
                      autoComplete="email"
                      required
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t.password}</label>
                    <input
                      type="password"
                      className="form-control"
                      minLength={authMode === 'register' ? 12 : undefined}
                      required
                      autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    />
                    {authMode === 'register' && <small>{t.passwordLengthNote}</small>}
                  </div>

                  <button type="submit" className="btn-submit">{authMode === 'login' ? t.login : t.register}</button>
                </form>
              </div>

              <div className="info-panel info-panel-image">
                <h3>Admin Portal</h3>
                <p>Only the Head Admin can approve or reject other admin registrations.</p>
                <div className="badge-info">
                  <strong>Access:</strong> admin login or pending admin registration approval.
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admin' && isAdmin && (
          <div className="admin-panel">
            <div className="stats-grid">
              <div className="stat-card">
                <span>{t.totalRequests}</span>
                <strong>{totalRequests}</strong>
              </div>
              <div className="stat-card warning">
                <span>{t.pendingReview}</span>
                <strong>{pendingRequests}</strong>
              </div>
              <div className="stat-card success">
                <span>{t.approvedCount}</span>
                <strong>{approvedRequests}</strong>
              </div>
              <div className="stat-card danger">
                <span>{t.rejectedCount}</span>
                <strong>{rejectedRequests}</strong>
              </div>
            </div>

            <div className="report-section card">
              <h2 className="card-title">{t.reportTitle}</h2>
              <div className="analytics-list">
                {serviceStats.map(item => (
                  <div key={item.service} className="analytics-item">
                    <span>{item.service}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>

            {isHeadAdmin && (
              <>
                <div className="card">
                  <h2 className="card-title">Pending Admin Registrations</h2>
                  {adminRequests.length ? (
                    <div className="table-responsive">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Contact</th>
                            <th>Submitted</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminRequests.filter(request => request.status === 'Pending').map(request => (
                            <tr key={request.id}>
                              <td>{request.name}</td>
                              <td>{request.email}</td>
                              <td>{request.phone}</td>
                              <td>{request.createdAt}</td>
                              <td>
                                <div className="action-buttons">
                                  <button onClick={() => updateAdminRequest(request.id, 'Approved')} className="btn-action btn-approve">Approve</button>
                                  <button onClick={() => updateAdminRequest(request.id, 'Rejected')} className="btn-action btn-reject">Reject</button>
                                  <button onClick={() => deleteAdminRequest(request.id)} className="btn-action btn-delete">Delete</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p>No pending admin registrations.</p>}
                </div>

                <div className="card">
                  <h2 className="card-title">Approved Admins</h2>
                  <div className="table-responsive">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Contact</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.filter(user => user.role === 'admin').map(admin => (
                          <tr key={admin.id}>
                            <td>{admin.name}</td>
                            <td>{admin.email}</td>
                            <td>{admin.phone}</td>
                            <td><button onClick={() => deleteAdminAccount(admin.id)} className="btn-action btn-delete">Delete</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            <div className="card">
              <h2 className="card-title">{t.recentRequests}</h2>
              <div className="table-responsive">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>{t.fullName}</th>
                      <th>{t.contact}</th>
                      <th>{t.serviceType}</th>
                      <th>{t.cityOfBody}</th>
                      <th>{t.causeOfDeath}</th>
                      <th>{t.coldStorageDuration}</th>
                      <th>{t.status}</th>
                      <th>{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map(booking => (
                      <tr key={booking.id}>
                        <td><strong>{booking.id}</strong></td>
                        <td>{booking.name}</td>
                        <td>{booking.phone}</td>
                        <td>{booking.service}</td>
                        <td>{booking.city || '—'}</td>
                        <td>{booking.causeOfDeath || '—'}</td>
                        <td>{booking.coldStorageDuration ? `${booking.coldStorageDuration} ${booking.coldStorageUnit || 'hours'}` : '—'}</td>
                        <td>
                          <span className={`status-badge ${
                            booking.status === 'Approved' ? 'status-approved' :
                            booking.status === 'Rejected' ? 'status-rejected' : 'status-pending'
                          }`}>
                            {booking.status === 'Approved' ? t.approved : booking.status === 'Rejected' ? t.rejected : t.pending}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            {booking.status === 'Pending' ? (
                              <>
                                <button onClick={() => updateStatus(booking.id, 'Approved')} className="btn-action btn-approve">{t.approve}</button>
                                <button onClick={() => updateStatus(booking.id, 'Rejected')} className="btn-action btn-reject">{t.reject}</button>
                              </>
                            ) : (
                              <span style={{ color: '#9ca3af' }}>—</span>
                            )}
                            <button onClick={() => deleteBooking(booking.id)} className="btn-action btn-delete">{t.delete}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'mortuary' && (
          <section className="mortuary-detail-section">
            <div className="founder-profile">
              <div className="founder-photo-wrap">
                <img
                  className="founder-photo"
                  src={new URL('../zafar abbas.jpg', import.meta.url).href}
                  alt="Zafar Abbas"
                />
              </div>
              <div className="founder-content">
                <span className="founder-tag">Founder Profile</span>
                <h3>Zafar Abbas</h3>
                <p>
                  Zafar Abbas is a prominent welfare leader associated with the JDC Foundation mission of serving humanity with compassion and dignity. His work reflects a deep commitment to helping vulnerable families during critical times and creating an institution that delivers practical support to those in need.
                </p>
                <p>
                  Under his leadership and vision, JDC expanded from a modest local effort into a broad social welfare network focused on relief, healthcare, education, shelter, and funeral services. His approach centers on empathy, community service, and ensuring that assistance reaches people without discrimination.
                </p>
              </div>
            </div>

            <div className="mortuary-detail-header">
              <span className="mortuary-badge">Free Mortuary in Karachi</span>
              <h2>JDC Mortuary in Karachi</h2>
            </div>

            <div className="mortuary-detail-grid">
              <div className="mortuary-article">
                <p>
                  JDC offers an array of welfare services in Pakistan. JDC’s free mortuary in Pakistan fulfils one of the core needs of the local population. The goal behind this free mortuary in Karachi is to improve the community’s well-being and address a vital public service need related to funeral and mortuary facilities.
                </p>
                <p>
                  The aim is to serve the community by providing all essential services necessary for the execution of a proper funeral. It signifies an important turning point for the local community and stands ready to serve as a vital facility for Karachites.
                </p>
                <p>
                  A notable aspect of JDC Free Mortuary is its dedication to providing services at no charge. It reflects a commitment to social responsibility and the welfare of the community, while creating a positive influence on society and making a meaningful impact during moments of sorrow.
                </p>
                <p>
                  The facility is expected to play a pivotal role in easing the burden on families during loss. It strives to make certain that anyone, regardless of financial situation, has access to courteous and caring services.
                </p>
              </div>

              <div className="mortuary-side-panel">
                <h3>Services & Support</h3>
                <ul className="mortuary-list">
                  <li>Free body washing and respectful care</li>
                  <li>Shrouding and funeral support</li>
                  <li>Support for families regardless of financial status</li>
                  <li>Assistance with dignified final rites</li>
                </ul>

                <div className="mortuary-contact-box">
                  <strong>Location:</strong>
                  <span>Federal B Area Block 16, near Sohrab Goth, Karachi</span>
                </div>

                <div className="mortuary-contact-box">
                  <strong>Helpline:</strong>
                  <span>1024</span>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}