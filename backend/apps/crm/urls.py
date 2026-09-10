from django.urls import path
from .views import (
    ClientListView,
    ClientDetailView,
    ApplicationListView,
    ApplicationDetailView,
    RejectionReasonListView,
    MeetingListCreateView,
    MeetingDetailView,
    UserListView,
    ClientFileView,
    DashboardAnalyticsView,
    MeetingSummaryView,
    ApplicationSummaryView,
    ApplicationStatusListCreateView,
    ApplicationStatusDetailView,
    ApplicationRestoreView,
    MeetingRestoreView,
)

urlpatterns = [
    # Dashboard
    path('dashboard/analytics/', DashboardAnalyticsView.as_view(), name='dashboard-analytics'),

    # Clients
    path('clients/', ClientListView.as_view(), name='client-list-create'),
    path('clients/<int:pk>/', ClientDetailView.as_view(), name='client-detail'),
    path('clients/<int:pk>/files/', ClientFileView.as_view(), name='client-files'),


    # Applications
    path('applications/', ApplicationListView.as_view(), name='application-list-create'),
    path('applications/<int:pk>/', ApplicationDetailView.as_view(), name='application-detail'),
    path('applications/<int:pk>/restore/', ApplicationRestoreView.as_view(), name='application-restore'),
    path('applications/summary/', ApplicationSummaryView.as_view(), name='application-summary'),
    path('users/', UserListView.as_view(), name='user-list'),

    # Application Statuses
    path('application-statuses/', ApplicationStatusListCreateView.as_view(), name='application-status-list-create'),
    path('application-statuses/<int:pk>/', ApplicationStatusDetailView.as_view(), name='application-status-detail'),

    # Meetings
    path('meetings/', MeetingListCreateView.as_view(), name='meeting-list-create'),
    path('meetings/<int:pk>/', MeetingDetailView.as_view(), name='meeting-detail'),
    path('meetings/<int:pk>/restore/', MeetingRestoreView.as_view(), name='meeting-restore'),
    path('meetings/summary/', MeetingSummaryView.as_view(), name='meeting-summary'),

    # Rejection Reasons
    path('rejection-reasons/', RejectionReasonListView.as_view(), name='rejection-reason-list'),
]