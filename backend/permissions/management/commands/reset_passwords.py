from django.core.management.base import BaseCommand
from django.contrib.auth.models import User


class Command(BaseCommand):
    help = 'Reset passwords for test users'

    def handle(self, *args, **options):
        users_to_reset = [
            ('admin', 'admin'),
            ('manager1', 'manager1'),
            ('manager2', 'manager2'),
            ('director1', 'director1'),
            ('viewer1', 'viewer1'),
            ('manager_company2', 'manager2'),
        ]
        
        for username, password in users_to_reset:
            try:
                user = User.objects.get(username=username)
                user.set_password(password)
                user.save()
                self.stdout.write(self.style.SUCCESS(f'{username}: password set to "{password}"'))
            except User.DoesNotExist:
                self.stdout.write(self.style.WARNING(f'{username}: user not found'))
        
        self.stdout.write(self.style.SUCCESS('Done!'))
