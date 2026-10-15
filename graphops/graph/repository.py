"""Small repository base; domain repositories own their Cypher queries."""
class Repository:
    def __init__(self, connection):
        self.connection = connection

    def read(self, query, **params):
        return self.connection.read(query, **params)

    def write(self, query, context=False, **params):
        return self.connection.write(query, context=context, **params)
