// Global variables
const currentUser = null;
const currentPage = 'dashboard';
const authToken = localStorage.getItem('authToken');
import axios from 'axios'; // Import axios

// Alpine.js app
function app() {
  return {
    // State
    loading: true,
    isAuthenticated: false,
    user: null,
    currentPage: 'dashboard',
    showPassword: false,

    // Notification
    notification: {
      show: false,
      type: 'info',
      title: '',
      message: '',
    },

    // Login
    loginForm: {
      phone: '',
      password: '',
    },
    loginLoading: false,

    // Data
    stats: {},
    students: [],
    groups: [],
    badges: [],
    dailyBadges: [],
    payments: [],
    users: [],
    lessons: [],

    // Pagination
    studentPagination: {
      currentPage: 1,
      totalPages: 1,
      total: 0,
      hasNext: false,
      hasPrev: false,
    },
    paymentPagination: {
      currentPage: 1,
      totalPages: 1,
      total: 0,
      hasNext: false,
      hasPrev: false,
    },
    badgePagination: {
      currentPage: 1,
      totalPages: 1,
      total: 0,
      hasNext: false,
      hasPrev: false,
    },

    // Filters
    studentFilters: {
      search: '',
      group: '',
      status: '',
    },
    paymentFilters: {
      student: '',
      status: '',
      month: '',
      year: new Date().getFullYear(),
    },
    badgeFilters: {
      student: '',
      group: '',
      date: '',
    },

    // Modals
    showAddStudentModal: false,
    showEditStudentModal: false,
    showAddGroupModal: false,
    showEditGroupModal: false,
    showAddBadgeModal: false,
    showEditBadgeModal: false,
    showAddPaymentModal: false,
    showEditPaymentModal: false,
    showBulkBadgeModal: false,
    showBulkMessageModal: false,
    showAddLessonModal: false,

    // Forms
    studentForm: {
      fullName: '',
      phone: '',
      parentPhone: '',
      group: '',
      monthlyFee: '',
      status: 'active',
    },
    groupForm: {
      name: '',
      teacher: '',
      schedule: [{ dayOfWeek: 1, startTime: '09:00', endTime: '11:00' }],
    },
    badgeForm: {
      name: '',
      description: '',
      color: 'green',
      category: 'academic',
      priority: 1,
      redBadgeLimit: 2,
    },
    paymentForm: {
      student: '',
      amount: '',
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      status: 'pending',
    },
    bulkBadgeForm: {
      students: [],
      badges: [],
      date: new Date().toISOString().split('T')[0],
      notes: '',
    },
    bulkMessageForm: {
      recipients: [],
      recipientType: 'parents', // parents, teachers, specific
      title: '',
      message: '',
      type: 'general',
    },
    lessonForm: {
      group: '',
      teacher: '',
      subject: 'General',
      topic: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '11:00',
      homework: '',
      notes: '',
    },

    // Selected items for bulk operations
    selectedStudents: [],
    selectedPayments: [],
    selectedUsers: [],

    // Current editing item
    currentEditingStudent: null,
    currentEditingGroup: null,
    currentEditingBadge: null,
    currentEditingPayment: null,

    // Initialize
    async init() {
      this.checkAuth();
      if (this.isAuthenticated) {
        await this.loadInitialData();
      }
      this.loading = false;
    },

    // Auth methods
    checkAuth() {
      const token = localStorage.getItem('accessToken');
      const user = localStorage.getItem('user');

      if (token && user) {
        this.isAuthenticated = true;
        this.user = JSON.parse(user);
        this.setAuthHeader(token);
      }
    },

    setAuthHeader(token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    },

    async login() {
      this.loginLoading = true;

      try {
        const response = await axios.post('/api/v1/login', this.loginForm);

        if (response.data.success) {
          localStorage.setItem('accessToken', response.data.accessToken);
          localStorage.setItem('refreshToken', response.data.refreshToken);
          localStorage.setItem('user', JSON.stringify(response.data.user));

          this.isAuthenticated = true;
          this.user = response.data.user;
          this.setAuthHeader(response.data.accessToken);

          await this.loadInitialData();
          this.showNotification(
            'success',
            'Muvaffaqiyat',
            'Tizimga muvaffaqiyatli kirdingiz'
          );
        } else {
          this.showNotification(
            'error',
            'Xatolik',
            response.data.error || 'Kirish xatosi'
          );
        }
      } catch (error) {
        console.error('Login error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          error.response?.data?.error || 'Server bilan aloqa xatosi'
        );
      } finally {
        this.loginLoading = false;
      }
    },

    async logout() {
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        await axios.post('/api/v1/logout', { refreshToken });
      } catch (error) {
        console.error('Logout error:', error);
      }

      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      delete axios.defaults.headers.common['Authorization'];

      this.isAuthenticated = false;
      this.user = null;
      this.currentPage = 'dashboard';
      this.showNotification(
        'success',
        'Muvaffaqiyat',
        'Tizimdan muvaffaqiyatli chiqildi'
      );
    },

    // Data loading methods
    async loadInitialData() {
      await Promise.all([
        this.loadStats(),
        this.loadStudents(),
        this.loadGroups(),
        this.loadBadges(),
        this.loadUsers(),
      ]);
    },

    async loadPageData(page) {
      switch (page) {
        case 'dashboard':
          await this.loadStats();
          break;
        case 'students':
          await this.loadStudents();
          break;
        case 'groups':
          await this.loadGroups();
          break;
        case 'badges':
          await this.loadBadges();
          await this.loadDailyBadges();
          break;
        case 'payments':
          await this.loadPayments();
          break;
        case 'lessons':
          await this.loadLessons();
          break;
      }
    },

    async loadStats() {
      try {
        const response = await axios.get('/api/v1/stats/dashboard');
        if (response.data.success) {
          this.stats = response.data.stats;
        }
      } catch (error) {
        console.error('Stats loading error:', error);
      }
    },

    async loadStudents() {
      try {
        const params = new URLSearchParams({
          page: this.studentPagination.currentPage,
          limit: 10,
          ...this.studentFilters,
        });

        const response = await axios.get(`/api/v1/students?${params}`);
        if (response.data.success) {
          this.students = response.data.students;
          this.studentPagination = response.data.pagination;
        }
      } catch (error) {
        console.error('Students loading error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          "O'quvchilarni yuklashda xatolik"
        );
      }
    },

    async loadGroups() {
      try {
        const response = await axios.get('/api/v1/groups');
        if (response.data.success) {
          this.groups = response.data.groups;
        }
      } catch (error) {
        console.error('Groups loading error:', error);
      }
    },

    async loadBadges() {
      try {
        const response = await axios.get('/api/v1/badges');
        if (response.data.success) {
          this.badges = response.data.badges;
        }
      } catch (error) {
        console.error('Badges loading error:', error);
      }
    },

    async loadDailyBadges() {
      try {
        const params = new URLSearchParams({
          page: this.badgePagination.currentPage,
          limit: 10,
          ...this.badgeFilters,
        });

        const response = await axios.get(`/api/v1/daily-badges?${params}`);
        if (response.data.success) {
          this.dailyBadges = response.data.dailyBadges;
          this.badgePagination = response.data.pagination;
        }
      } catch (error) {
        console.error('Daily badges loading error:', error);
      }
    },

    async loadPayments() {
      try {
        const params = new URLSearchParams({
          page: this.paymentPagination.currentPage,
          limit: 10,
          ...this.paymentFilters,
        });

        const response = await axios.get(`/api/v1/payments?${params}`);
        if (response.data.success) {
          this.payments = response.data.payments;
          this.paymentPagination = response.data.pagination;
        }
      } catch (error) {
        console.error('Payments loading error:', error);
      }
    },

    async loadUsers() {
      try {
        const response = await axios.get('/api/v1/users');
        if (response.data.success) {
          this.users = response.data.users;
        }
      } catch (error) {
        console.error('Users loading error:', error);
      }
    },

    async loadLessons() {
      try {
        const response = await axios.get('/api/v1/lessons');
        if (response.data.success) {
          this.lessons = response.data.lessons || [];
        }
      } catch (error) {
        console.error('Lessons loading error:', error);
      }
    },

    // Student CRUD methods
    async addStudent() {
      try {
        const response = await axios.post('/api/v1/students', this.studentForm);
        if (response.data.success) {
          this.showAddStudentModal = false;
          this.resetStudentForm();
          await this.loadStudents();
          await this.loadStats(); // Refresh stats
          this.showNotification(
            'success',
            'Muvaffaqiyat',
            "O'quvchi muvaffaqiyatli qo'shildi"
          );
        }
      } catch (error) {
        console.error('Add student error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          error.response?.data?.error || "O'quvchi qo'shishda xatolik"
        );
      }
    },

    editStudent(student) {
      this.currentEditingStudent = student;
      this.studentForm = {
        fullName: student.user?.fullName || '',
        phone: student.user?.phone || '',
        group: student.group?._id || '',
        monthlyFee: student.monthlyFee || '',
        status: student.status || 'active',
      };
      this.showEditStudentModal = true;
    },

    async updateStudent() {
      try {
        const response = await axios.put(
          `/api/v1/students/${this.currentEditingStudent._id}`,
          this.studentForm
        );
        if (response.data.success) {
          this.showEditStudentModal = false;
          this.resetStudentForm();
          this.currentEditingStudent = null;
          await this.loadStudents();
          this.showNotification(
            'success',
            'Muvaffaqiyat',
            "O'quvchi yangilandi"
          );
        }
      } catch (error) {
        console.error('Update student error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          error.response?.data?.error || "O'quvchi yangilashda xatolik"
        );
      }
    },

    async deleteStudent(student) {
      if (confirm("Rostdan ham bu o'quvchini o'chirmoqchimisiz?")) {
        try {
          const response = await axios.delete(
            `/api/v1/students/${student._id}`
          );
          if (response.data.success) {
            await this.loadStudents();
            await this.loadStats();
            this.showNotification(
              'success',
              'Muvaffaqiyat',
              "O'quvchi o'chirildi"
            );
          }
        } catch (error) {
          console.error('Delete student error:', error);
          this.showNotification(
            'error',
            'Xatolik',
            "O'quvchini o'chirishda xatolik"
          );
        }
      }
    },

    // Group CRUD methods
    async addGroup() {
      try {
        const response = await axios.post('/api/v1/groups', this.groupForm);
        if (response.data.success) {
          this.showAddGroupModal = false;
          this.resetGroupForm();
          await this.loadGroups();
          await this.loadStats();
          this.showNotification('success', 'Muvaffaqiyat', 'Guruh yaratildi');
        }
      } catch (error) {
        console.error('Add group error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          error.response?.data?.error || 'Guruh yaratishda xatolik'
        );
      }
    },

    editGroup(group) {
      this.currentEditingGroup = group;
      this.groupForm = {
        name: group.name,
        teacher: group.teacher?._id || '',
        schedule: group.schedule || [
          { dayOfWeek: 1, startTime: '09:00', endTime: '11:00' },
        ],
      };
      this.showEditGroupModal = true;
    },

    async updateGroup() {
      try {
        const response = await axios.put(
          `/api/v1/groups/${this.currentEditingGroup._id}`,
          this.groupForm
        );
        if (response.data.success) {
          this.showEditGroupModal = false;
          this.resetGroupForm();
          this.currentEditingGroup = null;
          await this.loadGroups();
          this.showNotification('success', 'Muvaffaqiyat', 'Guruh yangilandi');
        }
      } catch (error) {
        console.error('Update group error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          error.response?.data?.error || 'Guruh yangilashda xatolik'
        );
      }
    },

    async deleteGroup(group) {
      if (confirm("Rostdan ham bu guruhni o'chirmoqchimisiz?")) {
        try {
          const response = await axios.delete(`/api/v1/groups/${group._id}`);
          if (response.data.success) {
            await this.loadGroups();
            await this.loadStats();
            this.showNotification(
              'success',
              'Muvaffaqiyat',
              "Guruh o'chirildi"
            );
          }
        } catch (error) {
          console.error('Delete group error:', error);
          this.showNotification(
            'error',
            'Xatolik',
            error.response?.data?.error || "Guruhni o'chirishda xatolik"
          );
        }
      }
    },

    // Badge CRUD methods
    async addBadge() {
      try {
        const response = await axios.post('/api/v1/badges', this.badgeForm);
        if (response.data.success) {
          this.showAddBadgeModal = false;
          this.resetBadgeForm();
          await this.loadBadges();
          this.showNotification('success', 'Muvaffaqiyat', 'Badge yaratildi');
        }
      } catch (error) {
        console.error('Add badge error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          error.response?.data?.error || 'Badge yaratishda xatolik'
        );
      }
    },

    editBadge(badge) {
      this.currentEditingBadge = badge;
      this.badgeForm = {
        name: badge.name,
        description: badge.description,
        color: badge.color,
        category: badge.category,
        priority: badge.priority,
        redBadgeLimit: badge.redBadgeLimit,
      };
      this.showEditBadgeModal = true;
    },

    async updateBadge() {
      try {
        const response = await axios.put(
          `/api/v1/badges/${this.currentEditingBadge._id}`,
          this.badgeForm
        );
        if (response.data.success) {
          this.showEditBadgeModal = false;
          this.resetBadgeForm();
          this.currentEditingBadge = null;
          await this.loadBadges();
          this.showNotification('success', 'Muvaffaqiyat', 'Badge yangilandi');
        }
      } catch (error) {
        console.error('Update badge error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          error.response?.data?.error || 'Badge yangilashda xatolik'
        );
      }
    },

    async deleteBadge(badge) {
      if (confirm("Rostdan ham bu badge'ni o'chirmoqchimisiz?")) {
        try {
          const response = await axios.delete(`/api/v1/badges/${badge._id}`);
          if (response.data.success) {
            await this.loadBadges();
            this.showNotification(
              'success',
              'Muvaffaqiyat',
              "Badge o'chirildi"
            );
          }
        } catch (error) {
          console.error('Delete badge error:', error);
          this.showNotification(
            'error',
            'Xatolik',
            "Badge o'chirishda xatolik"
          );
        }
      }
    },

    // Payment CRUD methods
    async addPayment() {
      try {
        const response = await axios.post('/api/v1/payments', this.paymentForm);
        if (response.data.success) {
          this.showAddPaymentModal = false;
          this.resetPaymentForm();
          await this.loadPayments();
          await this.loadStats();
          this.showNotification('success', 'Muvaffaqiyat', "To'lov yaratildi");
        }
      } catch (error) {
        console.error('Add payment error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          error.response?.data?.error || "To'lov yaratishda xatolik"
        );
      }
    },

    editPayment(payment) {
      this.currentEditingPayment = payment;
      this.paymentForm = {
        student: payment.student?._id || '',
        amount: payment.amount,
        month: payment.month,
        year: payment.year,
        status: payment.status,
      };
      this.showEditPaymentModal = true;
    },

    async updatePayment() {
      try {
        const response = await axios.put(
          `/api/v1/payments/${this.currentEditingPayment._id}`,
          this.paymentForm
        );
        if (response.data.success) {
          this.showEditPaymentModal = false;
          this.resetPaymentForm();
          this.currentEditingPayment = null;
          await this.loadPayments();
          this.showNotification('success', 'Muvaffaqiyat', "To'lov yangilandi");
        }
      } catch (error) {
        console.error('Update payment error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          error.response?.data?.error || "To'lov yangilashda xatolik"
        );
      }
    },

    async deletePayment(payment) {
      if (confirm("Rostdan ham bu to'lovni o'chirmoqchimisiz?")) {
        try {
          const response = await axios.delete(
            `/api/v1/payments/${payment._id}`
          );
          if (response.data.success) {
            await this.loadPayments();
            await this.loadStats();
            this.showNotification(
              'success',
              'Muvaffaqiyat',
              "To'lov o'chirildi"
            );
          }
        } catch (error) {
          console.error('Delete payment error:', error);
          this.showNotification(
            'error',
            'Xatolik',
            "To'lovni o'chirishda xatolik"
          );
        }
      }
    },

    // Bulk Badge operations
    async bulkBadgeAssign() {
      try {
        const response = await axios.post(
          '/api/v1/daily-badges/bulk',
          this.bulkBadgeForm
        );
        if (response.data.success) {
          this.showBulkBadgeModal = false;
          this.resetBulkBadgeForm();
          await this.loadDailyBadges();
          this.showNotification(
            'success',
            'Muvaffaqiyat',
            "Badge'lar muvaffaqiyatli berildi"
          );
        }
      } catch (error) {
        console.error('Bulk badge error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          error.response?.data?.error || 'Badge berishda xatolik'
        );
      }
    },

    // Bulk Message operations
    async sendBulkMessage() {
      try {
        const response = await axios.post(
          '/api/v1/notifications/bulk',
          this.bulkMessageForm
        );
        if (response.data.success) {
          this.showBulkMessageModal = false;
          this.resetBulkMessageForm();
          this.showNotification(
            'success',
            'Muvaffaqiyat',
            'Xabarlar yuborildi'
          );
        }
      } catch (error) {
        console.error('Bulk message error:', error);
        this.showNotification(
          'error',
          'Xatolik',
          error.response?.data?.error || 'Xabar yuborishda xatolik'
        );
      }
    },

    // Auto monthly payment creation
    async createMonthlyPayments() {
      if (confirm("Barcha faol o'quvchilar uchun oylik to'lov yaratilsinmi?")) {
        try {
          const response = await axios.post('/api/v1/payments/monthly-auto');
          if (response.data.success) {
            await this.loadPayments();
            await this.loadStats();
            this.showNotification(
              'success',
              'Muvaffaqiyat',
              `${response.data.created} ta oylik to'lov yaratildi va xabarlar yuborildi`
            );
          }
        } catch (error) {
          console.error('Auto payment error:', error);
          this.showNotification(
            'error',
            'Xatolik',
            error.response?.data?.error || "Oylik to'lov yaratishda xatolik"
          );
        }
      }
    },

    // Form reset methods
    resetStudentForm() {
      this.studentForm = {
        fullName: '',
        phone: '',
        parentPhone: '',
        group: '',
        monthlyFee: '',
        status: 'active',
      };
    },

    resetGroupForm() {
      this.groupForm = {
        name: '',
        teacher: '',
        schedule: [{ dayOfWeek: 1, startTime: '09:00', endTime: '11:00' }],
      };
    },

    resetBadgeForm() {
      this.badgeForm = {
        name: '',
        description: '',
        color: 'green',
        category: 'academic',
        priority: 1,
        redBadgeLimit: 2,
      };
    },

    resetPaymentForm() {
      this.paymentForm = {
        student: '',
        amount: '',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        status: 'pending',
      };
    },

    resetBulkBadgeForm() {
      this.bulkBadgeForm = {
        students: [],
        badges: [],
        date: new Date().toISOString().split('T')[0],
        notes: '',
      };
    },

    resetBulkMessageForm() {
      this.bulkMessageForm = {
        recipients: [],
        recipientType: 'parents',
        title: '',
        message: '',
        type: 'general',
      };
    },

    // Filter reset methods
    resetStudentFilters() {
      this.studentFilters = {
        search: '',
        group: '',
        status: '',
      };
      this.studentPagination.currentPage = 1;
      this.loadStudents();
    },

    resetPaymentFilters() {
      this.paymentFilters = {
        student: '',
        status: '',
        month: '',
        year: new Date().getFullYear(),
      };
      this.paymentPagination.currentPage = 1;
      this.loadPayments();
    },

    resetBadgeFilters() {
      this.badgeFilters = {
        student: '',
        group: '',
        date: '',
      };
      this.badgePagination.currentPage = 1;
      this.loadDailyBadges();
    },

    // Pagination methods
    nextStudentsPage() {
      if (this.studentPagination.hasNext) {
        this.studentPagination.currentPage++;
        this.loadStudents();
      }
    },

    prevStudentsPage() {
      if (this.studentPagination.hasPrev) {
        this.studentPagination.currentPage--;
        this.loadStudents();
      }
    },

    nextPaymentsPage() {
      if (this.paymentPagination.hasNext) {
        this.paymentPagination.currentPage++;
        this.loadPayments();
      }
    },

    prevPaymentsPage() {
      if (this.paymentPagination.hasPrev) {
        this.paymentPagination.currentPage--;
        this.loadPayments();
      }
    },

    nextBadgesPage() {
      if (this.badgePagination.hasNext) {
        this.badgePagination.currentPage++;
        this.loadDailyBadges();
      }
    },

    prevBadgesPage() {
      if (this.badgePagination.hasPrev) {
        this.badgePagination.currentPage--;
        this.loadDailyBadges();
      }
    },

    // Utility methods
    getStatusText(status) {
      const statusMap = {
        active: 'Faol',
        inactive: 'Nofaol',
        graduated: 'Bitirgan',
        dropped: 'Tashlab ketgan',
        paid: "To'langan",
        pending: 'Kutilmoqda',
        overdue: "Muddati o'tgan",
      };
      return statusMap[status] || status;
    },

    getBadgeColor(color) {
      const colorMap = {
        green: 'bg-green-100 text-green-800',
        blue: 'bg-blue-100 text-blue-800',
        yellow: 'bg-yellow-100 text-yellow-800',
        purple: 'bg-purple-100 text-purple-800',
        orange: 'bg-orange-100 text-orange-800',
        red: 'bg-red-100 text-red-800',
      };
      return colorMap[color] || 'bg-gray-100 text-gray-800';
    },

    getBadgeEmoji(color) {
      const emojiMap = {
        green: '🟢',
        blue: '🔵',
        yellow: '🟡',
        purple: '🟣',
        orange: '🟠',
        red: '🔴',
      };
      return emojiMap[color] || '⚪';
    },

    formatDate(dateString) {
      return new Date(dateString).toLocaleDateString('uz-UZ');
    },

    formatCurrency(amount) {
      return new Intl.NumberFormat('uz-UZ').format(amount) + " so'm";
    },

    // Selection methods for bulk operations
    toggleStudentSelection(student) {
      const index = this.selectedStudents.findIndex(
        (s) => s._id === student._id
      );
      if (index > -1) {
        this.selectedStudents.splice(index, 1);
      } else {
        this.selectedStudents.push(student);
      }
    },

    selectAllStudents() {
      if (this.selectedStudents.length === this.students.length) {
        this.selectedStudents = [];
      } else {
        this.selectedStudents = [...this.students];
      }
    },

    isStudentSelected(student) {
      return this.selectedStudents.some((s) => s._id === student._id);
    },

    // Schedule management
    addScheduleSlot() {
      this.groupForm.schedule.push({
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '11:00',
      });
    },

    removeScheduleSlot(index) {
      this.groupForm.schedule.splice(index, 1);
    },

    getDayName(dayOfWeek) {
      const days = [
        'Yakshanba',
        'Dushanba',
        'Seshanba',
        'Chorshanba',
        'Payshanba',
        'Juma',
        'Shanba',
      ];
      return days[dayOfWeek] || '';
    },

    showNotification(type, title, message) {
      this.notification = {
        show: true,
        type,
        title,
        message,
      };

      setTimeout(() => {
        this.hideNotification();
      }, 5000);
    },

    hideNotification() {
      this.notification.show = false;
    },
  };
}

// Setup axios defaults
axios.defaults.baseURL = window.location.origin;
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Setup axios interceptors for token refresh
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post('/api/v1/refresh', {
            refreshToken,
          });
          const newToken = response.data.accessToken;

          localStorage.setItem('accessToken', newToken);
          axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;

          return axios(originalRequest);
        }
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.reload();
      }
    }

    return Promise.reject(error);
  }
);
